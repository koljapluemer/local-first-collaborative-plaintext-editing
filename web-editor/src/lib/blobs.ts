import {
  type DocLink,
  MAX_BLOB_BYTES,
  WARN_BLOB_BYTES,
  downloadBlob,
  getBlobs,
  mimeOf,
  sha256Hex,
  uploadBlob,
} from '@tmt/shared'
import { createStore, del, get, keys, set } from 'idb-keyval'
import type * as Y from 'yjs'

// Content-addressed cache shared by all projects, and a queue of uploads that
// have not reached the server yet ("<docId>:<hash>" -> server URL).
const cache = createStore('tmt-blobs', 'bytes')
const pending = createStore('tmt-blob-uploads', 'pending')

const inflight = new Map<string, Promise<Uint8Array>>()

export async function getBlobBytes(link: DocLink, hash: string): Promise<Uint8Array> {
  const hit = await get<Uint8Array>(hash, cache)
  if (hit) return hit
  let p = inflight.get(hash)
  if (!p) {
    p = downloadBlob(link.server, link.docId, hash)
      .then(async (bytes) => {
        await set(hash, bytes, cache)
        return bytes
      })
      .finally(() => inflight.delete(hash))
    inflight.set(hash, p)
  }
  return p
}

export type SizeCheck = 'ok' | 'warn' | 'too-big'

export function checkSize(bytes: number): SizeCheck {
  if (bytes > MAX_BLOB_BYTES) return 'too-big'
  if (bytes > WARN_BLOB_BYTES) return 'warn'
  return 'ok'
}

/**
 * Adds a binary file locally first (cache + doc entry), then uploads in the
 * background. Failed uploads are retried on the next reconnect.
 */
export async function addBlob(link: DocLink, doc: Y.Doc, path: string, bytes: Uint8Array): Promise<void> {
  const hash = await sha256Hex(bytes)
  await set(hash, bytes, cache)
  await set(`${link.docId}:${hash}`, link.server, pending)
  getBlobs(doc).set(path, { hash, size: bytes.byteLength, mime: mimeOf(path) })
  await uploadPending(link, hash)
}

async function uploadPending(link: DocLink, hash: string) {
  const bytes = await get<Uint8Array>(hash, cache)
  if (bytes) await uploadBlob(link.server, link.docId, bytes, hash)
  await del(`${link.docId}:${hash}`, pending)
}

export async function retryPendingUploads(link: DocLink) {
  const prefix = `${link.docId}:`
  for (const key of await keys<string>(pending)) {
    if (key.startsWith(prefix)) await uploadPending(link, key.slice(prefix.length))
  }
}
