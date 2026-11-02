import { openProjectSession } from '@tmt/browser-client'
import type { DocLink } from '@tmt/shared'
import { ref, shallowRef } from 'vue'
import { useToast } from './toast'
import { awarenessUser, loadName } from './user'
export async function openProject(link: DocLink) {
  const session = await openProjectSession(link, awarenessUser(loadName(), link.key))
  const status = ref(session.status), peers = ref(session.peers), paths = shallowRef(session.paths)
  const off = session.on('change', () => { status.value = session.status; peers.value = session.peers; paths.value = session.paths })
  const offAuth = session.on('authentication-failed', () => useToast().error('This project is not on the server yet. Its creator must open it online once.'))
  return { link, doc: session.doc, awareness: session.awareness, status, peers, paths, setName: (name: string) => session.setUser(awarenessUser(name, link.key)), destroy() { off(); offAuth(); session.destroy() } }
}
export type Project = Awaited<ReturnType<typeof openProject>>
