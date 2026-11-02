import { getBlobBytes } from '@tmt/browser-client'
import { DEFAULT_MARKDOWN_CSS, getBlobs, normalizePath } from '@tmt/shared'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import type { Project } from './project'

export interface RenderResult { html: string; css: string; warnings: string[]; urls: string[] }

function relativePath(entry: string, reference: string): string | null {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) return null
  const base = entry.split('/').slice(0, -1)
  return normalizePath([...base, ...reference.split('/')].join('/'))
}

async function assetUrl(project: Project, entry: string, reference: string, urls: string[], warnings: string[]) {
  const path = relativePath(entry, reference)
  if (!path) return null
  const ref = getBlobs(project.doc).get(path)
  if (!ref) { warnings.push(`Missing asset: ${path}`); return null }
  try {
    const bytes = await getBlobBytes(project.link, ref.hash)
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: ref.mime }))
    urls.push(url)
    return url
  } catch { warnings.push(`Could not load asset: ${path}`); return null }
}

async function rewriteCss(project: Project, entry: string, source: string, urls: string[], warnings: string[]) {
  let root
  try { root = postcss.parse(source || DEFAULT_MARKDOWN_CSS) } catch (error) { throw new Error(error instanceof Error ? error.message : String(error)) }
  root.walkAtRules('import', (rule) => { warnings.push('@import is not allowed in styles.css'); rule.remove() })
  const declarations: import('postcss').Declaration[] = []
  root.walkDecls((decl) => { declarations.push(decl) })
  for (const decl of declarations) {
    const parsed = valueParser(decl.value)
    const nodes: Extract<valueParser.Node, { type: 'function' }>[] = []
    parsed.walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return
      nodes.push(node)
    })
    for (const node of nodes) {
      const raw = valueParser.stringify(node.nodes).trim().replace(/^(['"])(.*)\1$/, '$2')
      if (/^data:image\//i.test(raw)) continue
      const url = await assetUrl(project, entry, raw, urls, warnings)
      if (url) node.nodes = [{ type: 'word', value: url, sourceIndex: 0, sourceEndIndex: url.length }]
      else { decl.remove(); break }
    }
    if (decl.parent) decl.value = parsed.toString()
  }
  return root.toString()
}

export async function renderMarkdown(project: Project, entry: string, markdown: string, styleSource: string): Promise<RenderResult> {
  const warnings: string[] = [], urls: string[] = []
  const raw = marked.parse(markdown, { gfm: true, async: false }) as string
  const clean = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['video', 'source'],
    ADD_ATTR: ['controls', 'poster', 'preload', 'playsinline', 'src', 'type'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
  })
  const template = document.createElement('template'); template.innerHTML = clean
  for (const el of template.content.querySelectorAll<HTMLElement>('img[src], video[src], video[poster], source[src]')) {
    for (const attr of ['src', 'poster']) {
      const value = el.getAttribute(attr); if (!value) continue
      const url = await assetUrl(project, entry, value, urls, warnings)
      if (url) el.setAttribute(attr, url); else el.removeAttribute(attr)
    }
  }
  for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer' }
    else if (!href.startsWith('#') && !/^mailto:/i.test(href)) link.removeAttribute('href')
  }
  const css = await rewriteCss(project, entry, styleSource, urls, warnings)
  return { html: template.innerHTML, css, warnings: [...new Set(warnings)], urls }
}
