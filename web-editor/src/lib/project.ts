import { openProjectSession } from '@tmt/browser-client'
import type { DocLink } from '@tmt/shared'
import { ref, shallowRef } from 'vue'
import { useToast } from './toast'
import { awarenessUser, loadName } from './user'

export type SyncStatus = 'offline' | 'syncing' | 'synced'

export async function openProject(link: DocLink) {
  const session = await openProjectSession(link, awarenessUser(loadName(), link.key))
  const status = ref<SyncStatus>(session.status)
  const peers = ref(session.peers)
  const paths = shallowRef(session.paths)
  const offChange = session.on('change', () => {
    status.value = session.status
    peers.value = session.peers
    paths.value = session.paths
  })
  const offAuth = session.on('authentication-failed', () => {
    useToast().error('This project is not on the server yet. Whoever created it needs to open it once while online.')
  })
  return {
    link,
    doc: session.doc,
    provider: session.provider,
    awareness: session.awareness,
    status,
    peers,
    paths,
    setName(name: string) { session.setUser(awarenessUser(name, link.key)) },
    destroy() { offChange(); offAuth(); session.destroy() },
  }
}

export type Project = Awaited<ReturnType<typeof openProject>>
