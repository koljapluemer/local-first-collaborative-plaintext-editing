export interface CompileRequest {
  id: number
  main: string
  files: Record<string, string>
  /** `bytes` is only sent the first time the worker sees a hash. */
  blobs: { path: string; hash: string; bytes?: Uint8Array }[]
}

export interface Diagnostic {
  path: string
  package?: string
  /** 0-based */
  line: number
  severity: 'error' | 'warning'
  message: string
}

export interface CompileResponse {
  id: number
  pdf?: Uint8Array
  diagnostics: Diagnostic[]
}
