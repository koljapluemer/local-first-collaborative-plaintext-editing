import {
  type BlobRef,
  applyTextDiff,
  classify,
  getBlobs,
  getFiles,
  isIgnored,
  mimeOf,
  normalizePath,
  sha256Hex,
} from '@tmt/shared'
import * as Y from 'yjs'

/** Minimal view of the shared folder; paths are relative and '/'-separated. */
export interface FolderFs {
  /** All files below the root, recursively. */
  list(): Promise<string[]>
  read(path: string): Promise<Uint8Array>
  /** Writes (creating parent dirs). */
  write(path: string, bytes: Uint8Array): Promise<void>
  /** Moves the file out of the folder (deleted remotely). */
  trash(path: string): Promise<void>
}

export interface BlobTransport {
  upload(bytes: Uint8Array, hash: string): Promise<void>
  download(hash: string): Promise<Uint8Array>
}

export interface SyncState {
  /** Per text file: Y.Doc state whose text for that file equals what is on disk. */
  bases: Record<string, Uint8Array>
  /** Per binary file: hash of what is on disk. */
  diskBlobs: Record<string, string>
  /** Binary files that still need to reach the server. */
  pendingUploads: string[]
}

export interface StateStore {
  load(): Promise<SyncState | undefined>
  save(state: SyncState): Promise<void>
}

export const ORIGIN_DISK = 'disk'
const FLUSH_DEBOUNCE_MS = 300
const RETRY_MS = 15000

const dec = new TextDecoder()
const enc = new TextEncoder()

/**
 * Two-way sync between a folder and a project Y.Doc.
 *
 * For every text file we keep a "base": a replica of the doc whose text for
 * that file equals the file on disk. A disk edit is applied as a diff to the
 * base and the resulting CRDT update is merged into the doc, so offline disk
 * edits merge cleanly with remote edits instead of overwriting them.
 * Binary files are compared by hash.
 */
export class FolderSync {
  private bases = new Map<string, Y.Doc>()
  private diskBlobs: Record<string, string> = {}
  private pendingUploads = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false

  constructor(
    private doc: Y.Doc,
    private fs: FolderFs,
    private blobs: BlobTransport,
    private store: StateStore,
    private onError: (e: unknown) => void = console.error,
  ) {}

  async start() {
    const state = await this.store.load()
    for (const [path, update] of Object.entries(state?.bases ?? {})) {
      const base = new Y.Doc()
      Y.applyUpdate(base, update)
      // A base never contains anything the doc lacks; re-merge in case the doc missed a write.
      Y.applyUpdate(this.doc, update, ORIGIN_DISK)
      this.bases.set(path, base)
    }
    this.diskBlobs = state?.diskBlobs ?? {}
    this.pendingUploads = new Set(state?.pendingUploads ?? [])
    this.doc.on('update', this.onDocUpdate)
    await this.scan()
    await this.flush()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.flushTimer)
    clearTimeout(this.retryTimer)
    this.doc.off('update', this.onDocUpdate)
  }

  /** Waits for all queued work. */
  idle(): Promise<void> {
    return this.queue.then(() => {})
  }

  /** Disk -> doc. Call on file system events. */
  scan(): Promise<void> {
    return this.enqueue(() => this.doScan())
  }

  /** Doc -> disk. Scheduled automatically on doc updates. */
  flush(): Promise<void> {
    return this.enqueue(() => this.doFlush())
  }

  retryUploads(): Promise<void> {
    return this.enqueue(() => this.doUploads())
  }

  private onDocUpdate = () => {
    clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS)
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const p = this.queue.then(() => (this.stopped ? undefined : fn()))
    this.queue = p.catch(this.onError)
    return p
  }

  private baseText(path: string): string | undefined {
    return this.bases.get(path)?.getMap<Y.Text>('files').get(path)?.toString()
  }

  /** Makes the base of `path` reflect the current doc (after it was written to disk). */
  private catchUp(path: string) {
    let base = this.bases.get(path)
    if (!base) this.bases.set(path, (base = new Y.Doc()))
    Y.applyUpdate(base, Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(base)))
  }

  private async doScan() {
    const docFiles = getFiles(this.doc)
    const docBlobs = getBlobs(this.doc)
    const present = new Set<string>()
    const listed = (await this.fs.list()).map(normalizePath).filter((p): p is string => !!p && !isIgnored(p))
    const isCompileOutput = (p: string) =>
      p.endsWith('.pdf') &&
      !docBlobs.has(p) &&
      !(p in this.diskBlobs) &&
      (listed.includes(p.replace(/\.pdf$/, '.typ')) || docFiles.has(p.replace(/\.pdf$/, '.typ')))

    for (const path of listed) {
      const kind = classify(path)
      if (!kind || isCompileOutput(path)) continue
      present.add(path)
      const bytes = await this.fs.read(path)

      if (kind === 'text') {
        const text = dec.decode(bytes)
        const docText = docFiles.get(path)?.toString()
        if (text === docText) {
          if (this.baseText(path) !== text) this.catchUp(path)
        } else if (text !== this.baseText(path)) {
          this.applyDiskText(path, text)
        }
      } else {
        const hash = await sha256Hex(bytes)
        if (this.diskBlobs[path] === hash) continue
        if (docBlobs.get(path)?.hash !== hash) {
          const ref: BlobRef = { hash, size: bytes.byteLength, mime: mimeOf(path) }
          this.doc.transact(() => docBlobs.set(path, ref), ORIGIN_DISK)
          this.pendingUploads.add(path)
        }
        this.diskBlobs[path] = hash
      }
    }

    // Deleted on disk.
    for (const [path, base] of [...this.bases]) {
      if (present.has(path)) continue
      const sv = Y.encodeStateVector(base)
      base.getMap('files').delete(path)
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(base, sv), ORIGIN_DISK)
      this.bases.delete(path)
    }
    for (const [path, hash] of Object.entries(this.diskBlobs)) {
      if (present.has(path)) continue
      // Only delete if nobody replaced the file remotely in the meantime.
      if (docBlobs.get(path)?.hash === hash) this.doc.transact(() => docBlobs.delete(path), ORIGIN_DISK)
      delete this.diskBlobs[path]
      this.pendingUploads.delete(path)
    }

    await this.save()
    await this.doUploads()
  }

  private applyDiskText(path: string, text: string) {
    const docText = getFiles(this.doc).get(path)
    let base = this.bases.get(path)
    if (!base || !base.getMap<Y.Text>('files').has(path)) {
      if (docText) {
        // Known remotely but never synced to this folder: the disk version wins.
        this.doc.transact(() => applyTextDiff(docText, text), ORIGIN_DISK)
        this.catchUp(path)
        return
      }
      if (!base) {
        base = new Y.Doc()
        Y.applyUpdate(base, Y.encodeStateAsUpdate(this.doc))
        this.bases.set(path, base)
      }
      const sv = Y.encodeStateVector(base)
      base.getMap<Y.Text>('files').set(path, new Y.Text(text))
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(base, sv), ORIGIN_DISK)
      return
    }
    const sv = Y.encodeStateVector(base)
    applyTextDiff(base.getMap<Y.Text>('files').get(path)!, text)
    Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(base, sv), ORIGIN_DISK)
  }

  private async doFlush() {
    const docFiles = getFiles(this.doc)
    const docBlobs = getBlobs(this.doc)
    let failed = false

    for (const path of new Set([...docFiles.keys(), ...this.bases.keys()])) {
      const text = docFiles.get(path)?.toString()
      if (text === undefined) {
        if (this.baseText(path) !== undefined) await this.fs.trash(path)
        this.bases.delete(path)
        continue
      }
      if (this.baseText(path) === text) continue
      await this.fs.write(path, enc.encode(text))
      this.catchUp(path)
    }

    for (const path of new Set([...docBlobs.keys(), ...Object.keys(this.diskBlobs)])) {
      const ref = docBlobs.get(path)
      if (!ref) {
        await this.fs.trash(path)
        delete this.diskBlobs[path]
        this.pendingUploads.delete(path)
        continue
      }
      if (this.diskBlobs[path] === ref.hash) continue
      try {
        const bytes = await this.blobs.download(ref.hash)
        if ((await sha256Hex(bytes)) !== ref.hash) throw new Error(`hash mismatch for ${path}`)
        await this.fs.write(path, bytes)
        this.diskBlobs[path] = ref.hash
      } catch {
        failed = true
      }
    }

    await this.save()
    clearTimeout(this.retryTimer)
    if (failed && !this.stopped) this.retryTimer = setTimeout(() => this.flush(), RETRY_MS)
  }

  private async doUploads() {
    for (const path of [...this.pendingUploads]) {
      const bytes = await this.fs.read(path).catch(() => null)
      const hash = bytes && (await sha256Hex(bytes))
      if (!bytes || hash !== this.diskBlobs[path]) {
        this.pendingUploads.delete(path)
        continue
      }
      try {
        await this.blobs.upload(bytes, hash)
        this.pendingUploads.delete(path)
      } catch {
        // offline; retried on reconnect
      }
    }
    await this.save()
  }

  private save() {
    const bases: Record<string, Uint8Array> = {}
    for (const [path, base] of this.bases) bases[path] = Y.encodeStateAsUpdate(base)
    return this.store.save({ bases, diskBlobs: { ...this.diskBlobs }, pendingUploads: [...this.pendingUploads] })
  }
}
