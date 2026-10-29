export interface DocLink {
  docId: string
  /** HTTP(S) base URL of the sync server, e.g. https://sync.example.org */
  server: string
}

const DOC_ID_RE = /^[A-Za-z0-9_-]{22}$/

export function isDocId(id: string): boolean {
  return DOC_ID_RE.test(id)
}

/** 128 random bits, base64url without padding (22 chars). */
export function newDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function buildLink(editorBase: string, link: DocLink): string {
  const params = new URLSearchParams({ d: link.docId, s: trimSlash(link.server) })
  return `${trimSlash(editorBase)}/#${params.toString()}`
}

/** Parses a location hash ("#d=...&s=...") or a full link. */
export function parseLink(input: string, defaultServer?: string): DocLink | null {
  const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input
  const params = new URLSearchParams(hash)
  const docId = params.get('d') ?? ''
  const server = params.get('s') ?? defaultServer ?? ''
  if (!isDocId(docId) || !/^https?:\/\//.test(server)) return null
  return { docId, server: trimSlash(server) }
}

/** ws(s) endpoint of the sync server. */
export function syncUrl(server: string): string {
  return `${trimSlash(server).replace(/^http/, 'ws')}/sync`
}
