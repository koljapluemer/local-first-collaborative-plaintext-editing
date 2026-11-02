import { type DocLink, MAX_BLOB_BYTES, WARN_BLOB_BYTES, downloadBlob, getBlobs, mimeOf, sha256Hex, uploadBlob } from '@tmt/shared'
import { createStore, del, get, keys, set } from 'idb-keyval'
import type * as Y from 'yjs'
import { getCreateToken } from './token'

const cache = createStore('tmt-blobs', 'bytes')
const pending = createStore('tmt-blob-uploads', 'pending')
const inflight = new Map<string, Promise<Uint8Array>>()

export async function getBlobBytes(link: DocLink, hash: string): Promise<Uint8Array> {
  const hit = await get<Uint8Array>(hash, cache)
  if (hit) return hit
  let request = inflight.get(hash)
  if (!request) {
    request = downloadBlob(link.server, link.docId, hash)
      .then(async (bytes) => { await set(hash, bytes, cache); return bytes })
      .finally(() => inflight.delete(hash))
    inflight.set(hash, request)
  }
  return request
}

export type SizeCheck = 'ok' | 'warn' | 'too-big'
export function checkSize(bytes: number): SizeCheck {
  return bytes > MAX_BLOB_BYTES ? 'too-big' : bytes > WARN_BLOB_BYTES ? 'warn' : 'ok'
}

export async function addBlob(link: DocLink, doc: Y.Doc, path: string, bytes: Uint8Array): Promise<void> {
  const hash = await sha256Hex(bytes)
  await set(hash, bytes, cache)
  await set(`${link.docId}:${hash}`, link.server, pending)
  getBlobs(doc).set(path, { hash, size: bytes.byteLength, mime: mimeOf(path) })
  await uploadPending(link, hash)
}

async function uploadPending(link: DocLink, hash: string) {
  const bytes = await get<Uint8Array>(hash, cache)
  if (bytes) await uploadBlob(link.server, link.docId, bytes, hash, getCreateToken(link.server))
  await del(`${link.docId}:${hash}`, pending)
}

export async function retryPendingUploads(link: DocLink) {
  const prefix = `${link.docId}:`
  for (const pendingKey of await keys<string>(pending)) {
    if (pendingKey.startsWith(prefix)) await uploadPending(link, pendingKey.slice(prefix.length))
  }
}
