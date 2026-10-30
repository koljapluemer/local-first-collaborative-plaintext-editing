import { createHash, timingSafeEqual } from 'node:crypto'
import { access, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { SQLite } from '@hocuspocus/extension-sqlite'
import { Server } from '@hocuspocus/server'
import cors from 'cors'
import express from 'express'

export interface Config {
  port: number
  dataDir: string
  maxBlobMb: number
  /** Needed to create documents (joining existing ones only needs the doc id). Unset: anyone can create. */
  createToken?: string
  /** Built web editor (web-editor/dist) to serve at /. */
  editorDir?: string
  quiet?: boolean
}

const DOC_ID = '[A-Za-z0-9_-]{22}'
const HASH = '[0-9a-f]{64}'
const BLOB_PATH = new RegExp(`^/blobs/(${DOC_ID})/(${HASH})$`)

/** Decides who may write to a doc: anyone if it exists, otherwise only holders of the create token. */
type CanWrite = (docId: string, token: string) => boolean

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest()
}

function blobApp(config: Config, canWrite: CanWrite) {
  const blobDir = join(config.dataDir, 'blobs')
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())

  app.put(BLOB_PATH, express.raw({ type: () => true, limit: `${config.maxBlobMb}mb` }), async (req, res) => {
    const [docId, hash] = [req.params[0], req.params[1]]
    const token = req.get('authorization')?.replace(/^Bearer /, '') ?? ''
    if (!canWrite(docId, token)) {
      res.status(403).send('unknown document; creating one needs the create token')
      return
    }
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

  if (config.editorDir) app.use(editorApp(config.editorDir))

  return app
}

const ENCODINGS = [
  ['br', '.br'],
  ['gzip', '.gz'],
] as const

/**
 * Static web editor. Serves precompressed siblings (file.br, file.gz) when the client
 * accepts them, so the ~28 MB compiler wasm is never compressed per request.
 */
function editorApp(dir: string) {
  const root = resolve(dir)
  const router = express.Router()

  router.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const path = req.path.endsWith('/') ? `${req.path}index.html` : req.path
    let file: string
    try {
      file = resolve(root, `.${decodeURIComponent(path)}`)
    } catch {
      return next()
    }
    if (!file.startsWith(root + sep)) return next()
    for (const [encoding, ext] of ENCODINGS) {
      if (!req.acceptsEncodings(encoding)) continue
      const found = await stat(`${file}${ext}`).then((s) => s.isFile(), () => false)
      if (!found) continue
      // send keeps a Content-Type that is already set, so the .br/.gz file is served with the original type.
      res.type(extname(file))
      res.set('Content-Encoding', encoding)
      res.vary('Accept-Encoding')
      req.url = `${path}${ext}`
      break
    }
    next()
  })

  router.use(
    express.static(root, {
      setHeaders(res, file) {
        // Vite puts content-hashed files in assets/; everything else must be revalidated.
        const hashed = file.startsWith(join(root, 'assets') + sep)
        res.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )

  return router
}

export function createServer(config: Config) {
  const sqlite = new SQLite({ database: join(config.dataDir, 'docs.sqlite') })
  const expected = config.createToken ? sha256(config.createToken) : null
  const isStored = (docId: string) =>
    sqlite.db!.prepare('SELECT 1 FROM documents WHERE name = ?').get(docId) !== undefined

  const canWrite: CanWrite = (docId, token) => {
    if (!expected || timingSafeEqual(sha256(token), expected)) return true
    // Loaded documents count too: a new doc only reaches SQLite after the first store.
    return server.hocuspocus.documents.has(docId) || isStored(docId)
  }

  const app = blobApp(config, canWrite)
  const server = new Server({
    port: config.port,
    quiet: config.quiet,
    extensions: [sqlite],
    async onConnect({ documentName }) {
      if (!new RegExp(`^${DOC_ID}$`).test(documentName)) throw new Error('invalid document name')
    },
    async onAuthenticate({ documentName, token }) {
      if (!canWrite(documentName, token)) throw new Error('unknown document')
    },
    // Serve HTTP routes with express; throwing null stops hocuspocus' default response.
    async onRequest({ request, response }) {
      app(request as express.Request, response as express.Response)
      throw null
    },
  })
  return server
}
