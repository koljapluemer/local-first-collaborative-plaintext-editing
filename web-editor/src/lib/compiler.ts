import { getBlobs, getFiles, mainFile } from '@tmt/shared'
import { ref, shallowRef } from 'vue'
import { getBlobBytes } from './blobs'
import type { CompileRequest, CompileResponse, Diagnostic } from './compile-protocol'
import type { Project } from './project'

const DEBOUNCE_MS = 400

/** Recompiles the project's entry file to PDF in a worker whenever the doc changes. */
export function useCompiler(project: Project) {
  const pdf = shallowRef<Uint8Array | null>(null)
  const diagnostics = shallowRef<Diagnostic[]>([])
  const compiling = ref(false)

  const worker = new Worker(new URL('../typst.worker.ts', import.meta.url), { type: 'module' })
  const sentHashes = new Set<string>()
  let nextId = 1
  let running = false
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function buildRequest(): Promise<CompileRequest | null> {
    const main = mainFile(project.doc)
    if (!main) return null
    const files: Record<string, string> = {}
    getFiles(project.doc).forEach((t, p) => (files[p] = t.toString()))
    const blobs: CompileRequest['blobs'] = []
    for (const [path, ref] of getBlobs(project.doc).entries()) {
      if (sentHashes.has(ref.hash)) {
        blobs.push({ path, hash: ref.hash })
        continue
      }
      try {
        const bytes = await getBlobBytes(project.link, ref.hash)
        blobs.push({ path, hash: ref.hash, bytes })
        sentHashes.add(ref.hash)
      } catch {
        // Not downloadable yet (offline, or upload pending elsewhere); retried next compile.
      }
    }
    return { id: nextId++, main, files, blobs }
  }

  async function run() {
    if (running) {
      dirty = true
      return
    }
    running = true
    compiling.value = true
    try {
      const req = await buildRequest()
      if (!req) {
        diagnostics.value = [{ path: '', line: 0, severity: 'error', message: 'No .typ file in this project.' }]
        return
      }
      const res = await new Promise<CompileResponse>((resolve) => {
        const onMsg = (ev: MessageEvent<CompileResponse>) => {
          if (ev.data.id !== req.id) return
          worker.removeEventListener('message', onMsg)
          resolve(ev.data)
        }
        worker.addEventListener('message', onMsg)
        worker.postMessage(req)
      })
      diagnostics.value = res.diagnostics
      // Keep the last good PDF on error.
      if (res.pdf) pdf.value = res.pdf
    } finally {
      running = false
      compiling.value = false
      if (dirty) {
        dirty = false
        schedule()
      }
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(run, DEBOUNCE_MS)
  }

  project.doc.on('update', schedule)
  run()

  return {
    pdf,
    diagnostics,
    compiling,
    recompile: run,
    destroy() {
      clearTimeout(timer)
      project.doc.off('update', schedule)
      worker.terminate()
    },
  }
}
