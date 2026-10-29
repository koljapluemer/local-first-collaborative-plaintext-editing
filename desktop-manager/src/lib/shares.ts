import { load } from '@tauri-apps/plugin-store'
import { ref } from 'vue'

export interface Share {
  docId: string
  folder: string
  server: string
  active: boolean
}

export interface Settings {
  server: string
  editorUrl: string
}

const storePromise = load('shares.json', { defaults: {}, autoSave: true })

export const shares = ref<Share[]>([])
export const settings = ref<Settings>({ server: '', editorUrl: '' })

export async function loadAll() {
  const store = await storePromise
  shares.value = (await store.get<Share[]>('shares')) ?? []
  settings.value = { server: '', editorUrl: '', ...((await store.get<Settings>('settings')) ?? {}) }
}

export async function saveShares() {
  await (await storePromise).set('shares', shares.value)
}

export async function saveSettings() {
  await (await storePromise).set('settings', settings.value)
}
