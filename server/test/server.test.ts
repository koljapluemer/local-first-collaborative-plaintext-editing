import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
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

function connect(docId: string, token = '') {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({ url: syncUrl(base), name: docId, document: doc, token })
  let denied = false
  provider.on('authenticationFailed', () => {
    denied = true
  })
  return { doc, provider, denied: () => denied }
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

  describe('with a create token', () => {
    const token = 'secret'
    const tokenConfig = () => ({ ...config(), createToken: token })

    it('only lets token holders create docs, then anyone with the doc id joins', async () => {
      const newDoc = newDocId()
      let server = createServer(tokenConfig())
      await server.listen()
      const stranger = connect(newDoc, 'wrong')
      await until(() => stranger.denied())
      expect(stranger.provider.isSynced).toBe(false)
      stranger.provider.destroy()

      const owner = connect(newDoc, token)
      await until(() => owner.provider.isSynced)
      getFiles(owner.doc).set('main.typ', new Y.Text('= Owned\n'))
      const guest = connect(newDoc)
      await until(() => getFiles(guest.doc).get('main.typ')?.toString() === '= Owned\n')
      await until(() => !owner.provider.hasUnsyncedChanges)
      owner.provider.destroy()
      guest.provider.destroy()
      await server.destroy()

      server = createServer(tokenConfig())
      await server.listen()
      const later = connect(newDoc)
      try {
        await until(() => later.provider.isSynced)
        expect(getFiles(later.doc).get('main.typ')?.toString()).toBe('= Owned\n')
      } finally {
        later.provider.destroy()
        await server.destroy()
      }
    })

    it('requires the token for blob uploads to unknown docs', async () => {
      const server = createServer(tokenConfig())
      await server.listen()
      try {
        const bytes = new TextEncoder().encode('png')
        const hash = await sha256Hex(bytes)
        const unknown = `${base}/blobs/${newDocId()}/${hash}`
        expect((await fetch(unknown, { method: 'PUT', body: bytes })).status).toBe(403)
        const auth = { Authorization: `Bearer ${token}` }
        expect((await fetch(unknown, { method: 'PUT', body: bytes, headers: auth })).status).toBe(201)
        // docId was stored by the sync test above
        const known = `${base}/blobs/${docId}/${hash}`
        expect((await fetch(known, { method: 'PUT', body: bytes })).status).toBe(201)
      } finally {
        await server.destroy()
      }
    })
  })

  it('serves the web editor, precompressed when accepted', async () => {
    const editorDir = join(dataDir, 'editor')
    await mkdir(join(editorDir, 'assets'), { recursive: true })
    await writeFile(join(editorDir, 'index.html'), '<!doctype html>')
    await writeFile(join(editorDir, 'assets', 'app-abc.js'), 'console.log(1)')
    await writeFile(join(editorDir, 'assets', 'app-abc.js.gz'), gzipSync('console.log(1)'))
    const server = createServer({ ...config(), editorDir })
    await server.listen()
    try {
      const index = await fetch(`${base}/`)
      expect(index.status).toBe(200)
      expect(index.headers.get('cache-control')).toBe('no-cache')
      expect(await index.text()).toBe('<!doctype html>')

      // fetch decompresses transparently; the headers show what was sent
      const js = await fetch(`${base}/assets/app-abc.js`, { headers: { 'Accept-Encoding': 'gzip' } })
      expect(js.headers.get('content-encoding')).toBe('gzip')
      expect(js.headers.get('content-type')).toMatch(/javascript/)
      expect(js.headers.get('cache-control')).toContain('immutable')
      expect(await js.text()).toBe('console.log(1)')

      expect((await fetch(`${base}/%2e%2e/docs.sqlite`)).status).toBe(404)
      expect((await fetch(`${base}/health`)).status).toBe(200)
    } finally {
      await server.destroy()
    }
  })
})
