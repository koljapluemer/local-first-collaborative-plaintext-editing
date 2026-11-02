import { HocuspocusProvider } from '@hocuspocus/provider'
import { type DocLink, getBlobs, getFiles, syncUrl } from '@tmt/shared'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { retryPendingUploads } from './blobs'
import { getCreateToken } from './token'

export type SyncStatus = 'offline' | 'syncing' | 'synced'
export type SessionEvent = 'change' | 'authentication-failed'

export async function openProjectSession(link: DocLink, user?: unknown) {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`tmt:${link.docId}`, doc)
  await persistence.whenSynced
  let status: SyncStatus = 'offline'
  let peers = 1
  let paths: string[] = []
  const listeners = new Map<SessionEvent, Set<() => void>>()
  const emit = (event: SessionEvent) => listeners.get(event)?.forEach((fn) => fn())
  const provider = new HocuspocusProvider({ url: syncUrl(link.server), name: link.docId, document: doc, token: () => getCreateToken(link.server) })
  if (user) provider.setAwarenessField('user', user)
  let connected = false
  const updateStatus = () => {
    status = !connected ? 'offline' : provider.isSynced && !provider.hasUnsyncedChanges ? 'synced' : 'syncing'
    emit('change')
  }
  provider.on('authenticationFailed', () => emit('authentication-failed'))
  provider.on('status', ({ status: next }: { status: string }) => {
    connected = next === 'connected'; updateStatus()
    if (connected) retryPendingUploads(link).catch(() => {})
  })
  provider.on('synced', updateStatus)
  provider.on('unsyncedChanges', updateStatus)
  provider.on('awarenessChange', ({ states }: { states: unknown[] }) => { peers = states.length; emit('change') })
  const updatePaths = () => { paths = [...getFiles(doc).keys(), ...getBlobs(doc).keys()].sort(); emit('change') }
  getFiles(doc).observe(updatePaths); getBlobs(doc).observe(updatePaths); updatePaths()
  return {
    link, doc, provider, awareness: provider.awareness!,
    get status() { return status }, get peers() { return peers }, get paths() { return paths },
    on(event: SessionEvent, fn: () => void) { let set = listeners.get(event); if (!set) listeners.set(event, set = new Set()); set.add(fn); return () => set!.delete(fn) },
    setUser(value: unknown) { provider.setAwarenessField('user', value) },
    destroy() { provider.destroy(); persistence.destroy(); doc.destroy(); listeners.clear() },
  }
}

export type ProjectSession = Awaited<ReturnType<typeof openProjectSession>>
