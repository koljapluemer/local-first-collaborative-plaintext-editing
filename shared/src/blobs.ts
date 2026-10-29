import { trimSlash } from './link'

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function blobUrl(server: string, docId: string, hash: string): string {
  return `${trimSlash(server)}/blobs/${docId}/${hash}`
}

export async function uploadBlob(server: string, docId: string, bytes: Uint8Array, hash?: string): Promise<string> {
  hash ??= await sha256Hex(bytes)
  const res = await fetch(blobUrl(server, docId, hash), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes as Uint8Array<ArrayBuffer>,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => '')}`.trim())
  return hash
}

export async function downloadBlob(server: string, docId: string, hash: string): Promise<Uint8Array> {
  const res = await fetch(blobUrl(server, docId, hash))
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
