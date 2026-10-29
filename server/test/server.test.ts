import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { applyTextDiff, getFiles, newDocId, sha256Hex, syncUrl } from '@tmt/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createServer } from '../src/app'

let dataDir: string
const port = 20000 + Math.floor(Math.random() * 10000)
const base = `http://127.0.0.1:${port}`
const config = () => ({ port, dataDir, maxBlobMb: 1, quiet: true })

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'tmt-'))
})
afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

function until(cond: () => boolean, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const tick = () => (cond() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout')) : setTimeout(tick, 20))
    tick()
  })
}

function connect(docId: string) {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({ url: syncUrl(base), name: docId, document: doc })
  return { doc, provider }
}

describe('server', () => {
  const docId = newDocId()

  it('stores and serves blobs', async () => {
    const server = createServer(config())
    await server.listen()
    try {
      const bytes = new TextEncoder().encode('fake png')
      const hash = await sha256Hex(bytes)
      const url = `${base}/blobs/${docId}/${hash}`
      expect((await fetch(url, { method: 'PUT', body: bytes })).status).toBe(201)
      expect((await fetch(url, { method: 'PUT', body: bytes })).status).toBe(200)
      const got = await fetch(url)
      expect(got.status).toBe(200)
      expect(got.headers.get('access-control-allow-origin')).toBe('*')
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes)

      const bad = await fetch(`${base}/blobs/${docId}/${'0'.repeat(64)}`, { method: 'PUT', body: bytes })
      expect(bad.status).toBe(400)
      const big = new Uint8Array(2 * 1024 * 1024)
      const tooBig = await fetch(`${base}/blobs/${docId}/${await sha256Hex(big)}`, { method: 'PUT', body: big })
      expect(tooBig.status).toBe(413)
      expect((await fetch(`${base}/blobs/${docId}/${'1'.repeat(64)}`)).status).toBe(404)
      expect((await fetch(`${base}/blobs/../etc/passwd`)).status).toBe(404)
    } finally {
      await server.destroy()
    }
  })

  it('rejects document names that are not doc ids', async () => {
    const server = createServer(config())
    await server.listen()
    const bad = connect('../not-a-doc-id')
    try {
      await new Promise((r) => setTimeout(r, 500))
      expect(bad.provider.isSynced).toBe(false)
    } finally {
      bad.provider.destroy()
      await server.destroy()
    }
  })

  it('syncs two clients and persists across restarts', async () => {
    let server = createServer(config())
    await server.listen()
    const a = connect(docId)
    const b = connect(docId)
    await until(() => a.provider.isSynced && b.provider.isSynced)
    getFiles(a.doc).set('main.typ', new Y.Text('= Hello\n'))
    await until(() => getFiles(b.doc).get('main.typ')?.toString() === '= Hello\n')
    applyTextDiff(getFiles(b.doc).get('main.typ')!, '= Hello world\n')
    await until(() => getFiles(a.doc).get('main.typ')?.toString() === '= Hello world\n')
    await until(() => !a.provider.hasUnsyncedChanges && !b.provider.hasUnsyncedChanges)
    a.provider.destroy()
    b.provider.destroy()
    await server.destroy()

    server = createServer(config())
    await server.listen()
    const c = connect(docId)
    try {
      await until(() => c.provider.isSynced)
      expect(getFiles(c.doc).get('main.typ')?.toString()).toBe('= Hello world\n')
    } finally {
      c.provider.destroy()
      await server.destroy()
    }
  })
})
