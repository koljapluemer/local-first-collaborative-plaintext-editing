import { HocuspocusProvider } from '@hocuspocus/provider'
import { type DocLink, getBlobs, getFiles, syncUrl } from '@tmt/shared'
import { IndexeddbPersistence } from 'y-indexeddb'
import { ref, shallowRef } from 'vue'
import * as Y from 'yjs'
import { retryPendingUploads } from './blobs'
import { awarenessUser, loadName } from './user'

export type SyncStatus = 'offline' | 'syncing' | 'synced'

/**
 * Opens a project: the local Y.Doc is loaded from IndexedDB first, then synced
 * through the server whenever it is reachable. Everything works without it.
 */
export async function openProject(link: DocLink) {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`tmt:${link.docId}`, doc)
  await persistence.whenSynced

  const status = ref<SyncStatus>('offline')
  const peers = ref(1)
  const paths = shallowRef<string[]>([])

  const provider = new HocuspocusProvider({ url: syncUrl(link.server), name: link.docId, document: doc })
  provider.setAwarenessField('user', awarenessUser(loadName()))

  let connected = false
  const updateStatus = () => {
    status.value = !connected ? 'offline' : provider.isSynced && !provider.hasUnsyncedChanges ? 'synced' : 'syncing'
  }
  provider.on('status', ({ status: s }: { status: string }) => {
    connected = s === 'connected'
    updateStatus()
    if (connected) retryPendingUploads(link).catch(() => {})
  })
  provider.on('synced', updateStatus)
  provider.on('unsyncedChanges', updateStatus)
  provider.on('awarenessChange', ({ states }: { states: unknown[] }) => {
    peers.value = states.length
  })

  const updatePaths = () => {
    paths.value = [...getFiles(doc).keys(), ...getBlobs(doc).keys()].sort()
  }
  getFiles(doc).observe(updatePaths)
  getBlobs(doc).observe(updatePaths)
  updatePaths()

  return {
    link,
    doc,
    provider,
    awareness: provider.awareness!,
    status,
    peers,
    paths,
    setName(name: string) {
      provider.setAwarenessField('user', awarenessUser(name))
    },
    destroy() {
      provider.destroy()
      persistence.destroy()
      doc.destroy()
    },
  }
}

export type Project = Awaited<ReturnType<typeof openProject>>
