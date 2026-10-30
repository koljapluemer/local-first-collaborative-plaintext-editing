import { minidenticon } from 'minidenticons'

export interface DocLink {
  docId: string
  /** Identifies whose link this is. Not access control: the docId alone grants access. */
  key: string
  /** HTTP(S) base URL of the sync server, e.g. https://sync.example.org */
  server: string
}

const DOC_ID_RE = /^[A-Za-z0-9_-]{22}$/
const KEY_RE = /^[A-Za-z0-9_-]{11}$/

export function isDocId(id: string): boolean {
  return DOC_ID_RE.test(id)
}

export function isKey(key: string): boolean {
  return KEY_RE.test(key)
}

/** Random bytes, base64url without padding. */
function randomId(byteCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 128 random bits (22 chars). */
export function newDocId(): string {
  return randomId(16)
}

/** 64 random bits (11 chars). */
export function newKey(): string {
  return randomId(8)
}

/** Identicon for a key, as an SVG data URI. */
export function keyAvatar(key: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(minidenticon(key))}`
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function buildLink(editorBase: string, link: DocLink): string {
  const params = new URLSearchParams({ d: link.docId, k: link.key, s: trimSlash(link.server) })
  return `${trimSlash(editorBase)}/#${params.toString()}`
}

/** Parses a location hash ("#d=...&k=...&s=...") or a full link. */
export function parseLink(input: string, defaultServer?: string): DocLink | null {
  const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input
  const params = new URLSearchParams(hash)
  const docId = params.get('d') ?? ''
  const key = params.get('k') ?? ''
  const server = params.get('s') ?? defaultServer ?? ''
  if (!isDocId(docId) || !isKey(key) || !/^https?:\/\//.test(server)) return null
  return { docId, key, server: trimSlash(server) }
}

/** ws(s) endpoint of the sync server. */
export function syncUrl(server: string): string {
  return `${trimSlash(server).replace(/^http/, 'ws')}/sync`
}
