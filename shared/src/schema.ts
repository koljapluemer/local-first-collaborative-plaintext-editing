import * as Y from 'yjs'

/** Text files are synced character-wise as Y.Text. */
export const TEXT_EXTENSIONS = ['typ', 'bib', 'yml', 'yaml', 'csv', 'txt', 'json', 'toml', 'xml', 'md']

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

/** The entry file: meta.main if it still exists, else main.typ, else the first .typ file. */
export function mainFile(doc: Y.Doc): string | null {
  const files = getFiles(doc)
  const main = getMeta(doc).get('main')
  if (main && files.has(main)) return main
  if (files.has('main.typ')) return 'main.typ'
  const typ = [...files.keys()].filter((p) => p.endsWith('.typ')).sort()
  return typ[0] ?? null
}

