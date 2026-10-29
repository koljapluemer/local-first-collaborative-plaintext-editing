/// <reference lib="webworker" />
import { FetchPackageRegistry, MemoryAccessModel, createTypstCompiler, initOptions } from '@myriaddreamin/typst.ts'
import wasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'
import type { CompileRequest, CompileResponse, Diagnostic } from './lib/compile-protocol'

const am = new MemoryAccessModel()
const compiler = createTypstCompiler()
const ready = compiler.init({
  getModule: () => wasmUrl,
  beforeBuild: [initOptions.withAccessModel(am), initOptions.withPackageRegistry(new FetchPackageRegistry(am))],
})

const blobBytes = new Map<string, Uint8Array>()
// path -> content key ("t:<text>" or "b:<hash>") currently mapped into the compiler
const mapped = new Map<string, string>()
const enc = new TextEncoder()

function sync(req: CompileRequest) {
  for (const b of req.blobs) if (b.bytes) blobBytes.set(b.hash, b.bytes)
  const want = new Map<string, string>()
  for (const [path, text] of Object.entries(req.files)) want.set(path, `t:${text}`)
  for (const b of req.blobs) if (blobBytes.has(b.hash)) want.set(b.path, `b:${b.hash}`)

  for (const path of mapped.keys()) {
    if (!want.has(path)) {
      compiler.unmapShadow(`/${path}`)
      mapped.delete(path)
    }
  }
  for (const [path, key] of want) {
    if (mapped.get(path) === key) continue
    const content = key.slice(2)
    if (key.startsWith('b:')) compiler.mapShadow(`/${path}`, blobBytes.get(content)!)
    else if (path.endsWith('.typ')) compiler.addSource(`/${path}`, content)
    else compiler.mapShadow(`/${path}`, enc.encode(content))
    mapped.set(path, key)
  }
}

interface RawDiag {
  package?: string
  path?: string
  severity?: string
  range?: string
  message?: string
}

function toDiagnostic(d: RawDiag | string): Diagnostic {
  if (typeof d === 'string') return { path: '', line: 0, severity: 'error', message: d }
  // range looks like "2:9-3:15" (0-based lines)
  const line = Number(/^(\d+)/.exec(d.range ?? '')?.[1] ?? 0)
  return {
    path: (d.path ?? '').replace(/^\//, ''),
    package: d.package || undefined,
    line,
    severity: d.severity?.toLowerCase().includes('warn') ? 'warning' : 'error',
    message: d.message ?? '',
  }
}

self.onmessage = async (ev: MessageEvent<CompileRequest>) => {
  const req = ev.data
  let res: CompileResponse
  try {
    await ready
    sync(req)
    const out = await compiler.compile({
      mainFilePath: `/${req.main}`,
      root: '/',
      format: 1, // CompileFormatEnum.pdf
      diagnostics: 'full',
    })
    res = {
      id: req.id,
      pdf: out.result,
      diagnostics: ((out.diagnostics ?? []) as RawDiag[]).map(toDiagnostic),
    }
  } catch (e) {
    res = { id: req.id, diagnostics: [toDiagnostic(e instanceof Error ? e.message : String(e))] }
  }
  self.postMessage(res, res.pdf ? [res.pdf.buffer] : [])
}
