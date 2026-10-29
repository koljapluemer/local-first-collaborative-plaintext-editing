import { createHash } from 'node:crypto'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQLite } from '@hocuspocus/extension-sqlite'
import { Server } from '@hocuspocus/server'
import cors from 'cors'
import express from 'express'

export interface Config {
  port: number
  dataDir: string
  maxBlobMb: number
  quiet?: boolean
}

const DOC_ID = '[A-Za-z0-9_-]{22}'
const HASH = '[0-9a-f]{64}'
const BLOB_PATH = new RegExp(`^/blobs/(${DOC_ID})/(${HASH})$`)

function blobApp(config: Config) {
  const blobDir = join(config.dataDir, 'blobs')
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())

  app.put(BLOB_PATH, express.raw({ type: () => true, limit: `${config.maxBlobMb}mb` }), async (req, res) => {
    const [docId, hash] = [req.params[0], req.params[1]]
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (createHash('sha256').update(body).digest('hex') !== hash) {
      res.status(400).send('hash mismatch')
      return
    }
    const dir = join(blobDir, docId)
    const file = join(dir, hash)
    const exists = await access(file).then(() => true, () => false)
    if (!exists) {
      await mkdir(dir, { recursive: true })
      await writeFile(`${file}.tmp`, body)
      await rename(`${file}.tmp`, file)
    }
    res.status(exists ? 200 : 201).end()
  })

  app.get(BLOB_PATH, (req, res) => {
    res.sendFile(join(blobDir, req.params[0], req.params[1]), {
      headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  })

  app.get('/health', (_req, res) => {
    res.send('ok')
  })

  return app
}

export function createServer(config: Config) {
  const app = blobApp(config)
  return new Server({
    port: config.port,
    quiet: config.quiet,
    extensions: [new SQLite({ database: join(config.dataDir, 'docs.sqlite') })],
    async onConnect({ documentName }) {
      if (!new RegExp(`^${DOC_ID}$`).test(documentName)) throw new Error('invalid document name')
    },
    // Serve HTTP routes with express; throwing null stops hocuspocus' default response.
    async onRequest({ request, response }) {
      app(request as express.Request, response as express.Response)
      throw null
    },
  })
}
