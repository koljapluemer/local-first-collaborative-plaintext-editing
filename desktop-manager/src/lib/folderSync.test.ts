import { getBlobs, getFiles, sha256Hex } from '@tmt/shared'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type FolderFs, FolderSync, type SyncState } from './folderSync'

const enc = new TextEncoder()
const dec = new TextDecoder()

class MemFs implements FolderFs {
  files = new Map<string, Uint8Array>()
  trashed: string[] = []
  async list() {
    return [...this.files.keys()]
  }
  async read(p: string) {
    const f = this.files.get(p)
    if (!f) throw new Error(`ENOENT ${p}`)
    return f
  }
  async write(p: string, b: Uint8Array) {
    this.files.set(p, b)
  }
  async trash(p: string) {
    if (this.files.delete(p)) this.trashed.push(p)
  }
  text(p: string) {
    const f = this.files.get(p)
    return f && dec.decode(f)
  }
  put(p: string, s: string) {
    this.files.set(p, enc.encode(s))
  }
}

function setup(opts: { fs?: MemFs; state?: { v?: SyncState }; local?: Y.Doc } = {}) {
  const fs = opts.fs ?? new MemFs()
  const server = new Map<string, Uint8Array>()
  const state = opts.state ?? {}
  const local = opts.local ?? new Y.Doc()
  const sync = new FolderSync(
    local,
    fs,
    {
      upload: async (b, h) => void server.set(h, b),
      download: async (h) => {
        const b = server.get(h)
        if (!b) throw new Error('404')
        return b
      },
    },
    { load: async () => state.v, save: async (s) => void (state.v = structuredClone(s)) },
    (e) => {
      throw e
    },
  )
  return { fs, server, state, local, sync }
}

/** Connects two docs like a provider would. */
function link(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
  const ab = (u: Uint8Array, o: unknown) => o !== 'link' && Y.applyUpdate(b, u, 'link')
  const ba = (u: Uint8Array, o: unknown) => o !== 'link' && Y.applyUpdate(a, u, 'link')
  a.on('update', ab)
  b.on('update', ba)
  return () => {
    a.off('update', ab)
    b.off('update', ba)
  }
}

const settle = async (s: FolderSync) => {
  await s.flush()
  await s.idle()
}

describe('FolderSync', () => {
  it('imports a folder, ignoring junk and the compiled pdf', async () => {
    const t = setup()
    t.fs.put('main.typ', '= Hi\n')
    t.fs.put('refs.bib', '@book{a}')
    t.fs.put('img/a.png', 'PNG')
    t.fs.put('main.pdf', 'PDF')
    t.fs.put('.git/HEAD', 'ref')
    t.fs.put('notes.docx', 'x')
    await t.sync.start()
    expect([...getFiles(t.local).keys()].sort()).toEqual(['main.typ', 'refs.bib'])
    expect([...getBlobs(t.local).keys()]).toEqual(['img/a.png'])
    expect(t.server.get(await sha256Hex(enc.encode('PNG')))).toBeDefined()
  })

  it('writes remote edits to disk and picks up disk edits', async () => {
    const t = setup()
    t.fs.put('main.typ', 'Hello\n')
    await t.sync.start()
    const remote = new Y.Doc()
    link(t.local, remote)

    getFiles(remote).get('main.typ')!.insert(5, ' world')
    await settle(t.sync)
    expect(t.fs.text('main.typ')).toBe('Hello world\n')

    t.fs.put('main.typ', 'Hello world!\n')
    await t.sync.scan()
    expect(getFiles(remote).get('main.typ')!.toString()).toBe('Hello world!\n')

    getFiles(remote).set('ch.typ', new Y.Text('Chapter'))
    await settle(t.sync)
    expect(t.fs.text('ch.typ')).toBe('Chapter')

    // Echo of our own write is a no-op.
    const before = Y.encodeStateVector(remote)
    await t.sync.scan()
    expect(Y.encodeStateVector(remote)).toEqual(before)
  })

  it('merges disk edits made while stopped with remote edits', async () => {
    const fs = new MemFs()
    const state: { v?: SyncState } = {}
    fs.put('main.typ', 'one\ntwo\nthree\n')
    const first = setup({ fs, state })
    await first.sync.start()
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(first.local))
    const persisted = Y.encodeStateAsUpdate(first.local)
    first.sync.stop()

    // Offline: the folder and the remote diverge.
    fs.put('main.typ', 'one\ntwo (disk)\nthree\n')
    getFiles(remote).get('main.typ')!.insert(0, 'zero\n')

    const local = new Y.Doc()
    Y.applyUpdate(local, persisted)
    const second = setup({ fs, state, local })
    await second.sync.start()
    link(local, remote)
    await settle(second.sync)

    const expected = 'zero\none\ntwo (disk)\nthree\n'
    expect(getFiles(remote).get('main.typ')!.toString()).toBe(expected)
    expect(fs.text('main.typ')).toBe(expected)
  })

  it('does not duplicate text when restarted with an unchanged folder', async () => {
    const fs = new MemFs()
    const state: { v?: SyncState } = {}
    fs.put('main.typ', 'abc')
    const first = setup({ fs, state })
    await first.sync.start()
    const remote = new Y.Doc()
    link(first.local, remote)
    getFiles(remote).get('main.typ')!.insert(3, 'def')
    await settle(first.sync)
    const persisted = Y.encodeStateAsUpdate(first.local)
    first.sync.stop()

    const local = new Y.Doc()
    Y.applyUpdate(local, persisted)
    const second = setup({ fs, state, local })
    await second.sync.start()
    link(local, remote)
    await settle(second.sync)
    expect(getFiles(remote).get('main.typ')!.toString()).toBe('abcdef')
    expect(fs.text('main.typ')).toBe('abcdef')
  })

  it('propagates deletions both ways, trashing local files', async () => {
    const t = setup()
    t.fs.put('a.typ', 'a')
    t.fs.put('b.typ', 'b')
    t.fs.put('img.png', 'PNG')
    await t.sync.start()
    const remote = new Y.Doc()
    link(t.local, remote)

    t.fs.files.delete('a.typ')
    await t.sync.scan()
    expect(getFiles(remote).has('a.typ')).toBe(false)

    getFiles(remote).delete('b.typ')
    getBlobs(remote).delete('img.png')
    await settle(t.sync)
    expect(t.fs.trashed.sort()).toEqual(['b.typ', 'img.png'])
  })

  it('downloads remote blobs and retries when unavailable', async () => {
    const t = setup()
    await t.sync.start()
    const remote = new Y.Doc()
    link(t.local, remote)
    const bytes = enc.encode('JPEG')
    const hash = await sha256Hex(bytes)
    getBlobs(remote).set('pic.jpg', { hash, size: 4, mime: 'image/jpeg' })
    await settle(t.sync)
    expect(t.fs.files.has('pic.jpg')).toBe(false)
    t.server.set(hash, bytes)
    await settle(t.sync)
    expect(t.fs.text('pic.jpg')).toBe('JPEG')
    t.sync.stop()
  })
})
