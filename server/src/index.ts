import { mkdir } from 'node:fs/promises'
import { createServer } from './app'

const config = {
  port: Number(process.env.PORT ?? 1234),
  dataDir: process.env.DATA_DIR ?? './data',
  maxBlobMb: Number(process.env.MAX_BLOB_MB ?? 25),
  createToken: process.env.CREATE_TOKEN || undefined,
  editorDir: process.env.EDITOR_DIR || undefined,
}

await mkdir(config.dataDir, { recursive: true })
if (!config.createToken) console.warn('CREATE_TOKEN is not set: anyone who can reach this server can create documents.')
// Hocuspocus' own banner shows the bind address (0.0.0.0), which browsers cannot connect to.
await createServer({ ...config, quiet: true }).listen()
console.log(`take-my-typst server: http://localhost:${config.port} (data in ${config.dataDir})`)
