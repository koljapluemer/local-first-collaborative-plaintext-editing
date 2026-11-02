import { HocuspocusProvider } from '@hocuspocus/provider'
import { appDataDir, sep } from '@tauri-apps/api/path'
import { watch } from '@tauri-apps/plugin-fs'
import { DEFAULT_MARKDOWN_CSS, downloadBlob, entryFile, getFiles, getMeta, projectKind, syncUrl, uploadBlob } from '@tmt/shared'
import { createStore, get, set } from 'idb-keyval'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { FolderSync, type SyncState } from './folderSync'
import { type Share, settings } from './shares'
import { tauriFs } from './tauriFs'

export type ShareStatus = 'stopped' | 'starting' | 'offline' | 'syncing' | 'synced' | 'error'

const stateStore = createStore('tmt-desktop-sync', 'state')

/** Runs one shared folder: local doc + folder sync + server connection. */
export async function startSession(share: Share, onStatus: (s: ShareStatus, error?: string) => void, onKind?: (kind: Share['kind']) => void) {
  // The create token belongs to the configured server; never send it to servers of joined links.
  const token = () => (share.server === settings.value.server ? settings.value.createToken : '')
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`tmt-desktop:${share.docId}`, doc)
  await persistence.whenSynced

  const trashDir = `${await appDataDir()}${sep()}trash${sep()}${share.docId}`
  const sync = new FolderSync(
    doc,
    tauriFs(share.folder, trashDir),
    {
      upload: (bytes, hash) => uploadBlob(share.server, share.docId, bytes, hash, token()).then(() => {}),
      download: (hash) => downloadBlob(share.server, share.docId, hash),
    },
    {
      load: () => get<SyncState>(share.docId, stateStore),
      save: (s) => set(share.docId, s, stateStore),
    },
    (e) => onStatus('error', e instanceof Error ? e.message : String(e)),
  )
  await sync.start()
  if (share.newProject && !getMeta(doc).has('kind')) {
    doc.transact(() => {
      getMeta(doc).set('schemaVersion', '1')
      getMeta(doc).set('kind', share.kind)
      let entry = entryFile(doc, share.kind)
      if (!entry) {
        entry = share.kind === 'markdown' ? 'document.md' : 'main.typ'
        getFiles(doc).set(entry, new Y.Text(share.kind === 'markdown' ? '# Untitled\n\n' : '= Untitled\n\n'))
      }
      getMeta(doc).set('entry', entry)
      if (share.kind === 'markdown' && !getFiles(doc).has('styles.css')) getFiles(doc).set('styles.css', new Y.Text(DEFAULT_MARKDOWN_CSS))
    })
  }
  const unwatch = await watch(share.folder, () => sync.scan(), { recursive: true, delayMs: 300 })

  const provider = new HocuspocusProvider({ url: syncUrl(share.server), name: share.docId, document: doc, token })
  provider.on('authenticationFailed', () =>
    onStatus('error', 'Not on the server yet. Set the create token, or ask whoever created it to sync once.'),
  )
  const folderName = share.folder.split(/[\\/]/).filter(Boolean).pop()
  provider.setAwarenessField('user', { name: `${folderName} (desktop)`, color: '#737373', colorLight: '#73737333' })

  let connected = false
  const update = () =>
    onStatus(!connected ? 'offline' : provider.isSynced && !provider.hasUnsyncedChanges ? 'synced' : 'syncing')
  provider.on('status', ({ status }: { status: string }) => {
    connected = status === 'connected'
    update()
    if (connected) sync.retryUploads()
  })
  provider.on('synced', () => { update(); onKind?.(projectKind(doc)) })
  provider.on('unsyncedChanges', update)
  update()

  return {
    async stop() {
      unwatch()
      sync.stop()
      await sync.idle()
      provider.destroy()
      persistence.destroy()
      doc.destroy()
    },
  }
}

export type Session = Awaited<ReturnType<typeof startSession>>
