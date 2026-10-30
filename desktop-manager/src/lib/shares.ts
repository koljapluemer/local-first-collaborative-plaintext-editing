import { load } from '@tauri-apps/plugin-store'
import { newKey } from '@tmt/shared'
import { ref } from 'vue'

/** A link key. The label is a local note (e.g. who got the link) and never leaves this app. */
export interface ShareKey {
  key: string
  label: string
}

export interface Share {
  docId: string
  folder: string
  server: string
  active: boolean
  keys: ShareKey[]
}

export interface Settings {
  server: string
  editorUrl: string
  /** The sync server's create token; needed to create docs there. */
  createToken: string
}

const storePromise = load('shares.json', { defaults: {}, autoSave: true })

export const shares = ref<Share[]>([])
const defaultSettings: Settings = { server: '', editorUrl: '', createToken: '' }

export const settings = ref<Settings>({ ...defaultSettings })

export async function loadAll() {
  const store = await storePromise
  shares.value = (await store.get<Share[]>('shares')) ?? []
  // Shares from before link keys existed get one key.
  const unkeyed = shares.value.filter((s) => !s.keys?.length)
  for (const s of unkeyed) s.keys = [{ key: newKey(), label: '' }]
  if (unkeyed.length) await saveShares()
  settings.value = { ...defaultSettings, ...((await store.get<Settings>('settings')) ?? {}) }
}

export async function saveShares() {
  await (await storePromise).set('shares', shares.value)
}

export async function saveSettings() {
  await (await storePromise).set('settings', settings.value)
}
