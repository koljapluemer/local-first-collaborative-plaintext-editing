import * as Y from 'yjs'

/** Text files are synced character-wise as Y.Text. */
export const TEXT_EXTENSIONS = ['typ', 'bib', 'yml', 'yaml', 'csv', 'txt', 'json', 'toml', 'xml', 'md', 'markdown', 'css']

/** Binary files are synced as content-addressed blobs. */
export const BLOB_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
}

export const WARN_BLOB_BYTES = 5 * 1024 * 1024
export const MAX_BLOB_BYTES = 25 * 1024 * 1024

export interface BlobRef {
  hash: string
  size: number
  mime: string
}

export type FileKind = 'text' | 'blob'

export function extOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function classify(path: string): FileKind | null {
  const ext = extOf(path)
  if (TEXT_EXTENSIONS.includes(ext)) return 'text'
  if (ext in BLOB_MIME) return 'blob'
  return null
}

export function mimeOf(path: string): string {
  return BLOB_MIME[extOf(path)] ?? 'application/octet-stream'
}

const IGNORED_DIRS = new Set(['node_modules', 'target', 'dist'])

/** Paths (relative, '/'-separated) that are never synced. */
export function isIgnored(path: string): boolean {
  const parts = path.split('/')
  return parts.some((p) => p.startsWith('.') || IGNORED_DIRS.has(p))
}

/** Normalises and validates a project-relative path; returns null if unusable. */
export function normalizePath(path: string): string | null {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p !== '' && p !== '.')
  if (parts.length === 0 || parts.includes('..')) return null
  return parts.join('/')
}

export function getFiles(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap<Y.Text>('files')
}

export function getBlobs(doc: Y.Doc): Y.Map<BlobRef> {
  return doc.getMap<BlobRef>('blobs')
}

export function getMeta(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('meta')
}

export type ProjectKind = 'typst' | 'markdown'

export interface ProjectProfile {
  kind: ProjectKind
  entryExtensions: readonly string[]
  defaultEntry: string
}

export const PROJECT_PROFILES: Record<ProjectKind, ProjectProfile> = {
  typst: { kind: 'typst', entryExtensions: ['typ'], defaultEntry: 'main.typ' },
  markdown: { kind: 'markdown', entryExtensions: ['md', 'markdown'], defaultEntry: 'document.md' },
}

/** Documents created before project kinds existed are Typst projects. */
export function projectKind(doc: Y.Doc): ProjectKind {
  return getMeta(doc).get('kind') === 'markdown' ? 'markdown' : 'typst'
}

export function isEntryPath(kind: ProjectKind, path: string): boolean {
  return PROJECT_PROFILES[kind].entryExtensions.includes(extOf(path))
}

/** Initializes a genuinely new document. Callers must not use this to infer the type of an asynchronously loading doc. */
export function initializeProject(doc: Y.Doc, kind: ProjectKind): void {
  if (getMeta(doc).has('kind') || getFiles(doc).size || getBlobs(doc).size) return
  doc.transact(() => {
    const meta = getMeta(doc)
    meta.set('schemaVersion', '1')
    meta.set('kind', kind)
    const entry = PROJECT_PROFILES[kind].defaultEntry
    meta.set('entry', entry)
    getFiles(doc).set(entry, new Y.Text(kind === 'typst' ? '= Untitled\n\n' : '# Untitled\n\n'))
    if (kind === 'markdown') getFiles(doc).set('styles.css', new Y.Text(DEFAULT_MARKDOWN_CSS))
  })
}

export const DEFAULT_MARKDOWN_CSS = `:host {
  color: #202124;
  background: #f3f4f6;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  line-height: 1.65;
}
.markdown-body {
  box-sizing: border-box;
  max-width: 72rem;
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 4rem);
  background: white;
}
.markdown-body img, .markdown-body video { max-width: 100%; height: auto; }
.markdown-body pre { overflow: auto; padding: 1rem; background: #f3f4f6; }
.markdown-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.markdown-body table { width: 100%; border-collapse: collapse; }
.markdown-body th, .markdown-body td { padding: .45rem .6rem; border: 1px solid #d1d5db; text-align: left; }
.markdown-body blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #9ca3af; color: #4b5563; }
`

/** The entry file: meta.main if it still exists, else main.typ, else the first .typ file. */
export function mainFile(doc: Y.Doc): string | null {
  const files = getFiles(doc)
  const main = getMeta(doc).get('main')
  if (main && files.has(main)) return main
  if (files.has('main.typ')) return 'main.typ'
  const typ = [...files.keys()].filter((p) => p.endsWith('.typ')).sort()
  return typ[0] ?? null
}

/** Entry file for either project kind, with legacy Typst compatibility. */
export function entryFile(doc: Y.Doc, kind: ProjectKind = projectKind(doc)): string | null {
  const files = getFiles(doc)
  const configured = getMeta(doc).get('entry') ?? (kind === 'typst' ? getMeta(doc).get('main') : undefined)
  if (configured && files.has(configured) && isEntryPath(kind, configured)) return configured
  const preferred = kind === 'typst' ? ['main.typ'] : ['README.md', 'document.md']
  for (const path of preferred) if (files.has(path)) return path
  return [...files.keys()].filter((path) => isEntryPath(kind, path)).sort()[0] ?? null
}

export function setEntryFile(doc: Y.Doc, path: string): boolean {
  if (!getFiles(doc).has(path) || !isEntryPath(projectKind(doc), path)) return false
  getMeta(doc).set('entry', path)
  return true
}

