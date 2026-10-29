<script setup lang="ts">
import { Copy, FolderPlus, Link2, Play, Settings, Square, Trash2 } from '@lucide/vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { open } from '@tauri-apps/plugin-dialog'
import { buildLink, newDocId, parseLink } from '@tmt/shared'
import { onMounted, reactive, ref } from 'vue'
import Toasts from './components/Toasts.vue'
import { type Session, type ShareStatus, startSession } from './lib/session'
import { type Share, loadAll, saveSettings, saveShares, settings, shares } from './lib/shares'
import { useToast } from './lib/toast'

const toast = useToast()
const sessions = new Map<string, Session>()
const status = reactive<Record<string, ShareStatus>>({})
const showSettings = ref(false)
const joinLink = ref('')

const badge: Record<ShareStatus, string> = {
  stopped: 'badge-ghost',
  starting: 'badge-ghost',
  offline: 'badge-warning',
  syncing: 'badge-info',
  synced: 'badge-success',
  error: 'badge-error',
}

onMounted(async () => {
  await loadAll()
  if (!settings.value.server) showSettings.value = true
  for (const s of shares.value) if (s.active) start(s)
})

async function start(share: Share) {
  if (sessions.has(share.docId)) return
  status[share.docId] = 'starting'
  try {
    const session = await startSession(share, (s, error) => {
      status[share.docId] = s
      if (error) toast.error(`${share.folder}: ${error}`)
    })
    sessions.set(share.docId, session)
  } catch (e) {
    status[share.docId] = 'error'
    toast.error(`${share.folder}: ${e instanceof Error ? e.message : e}`)
  }
}

async function stop(share: Share) {
  const session = sessions.get(share.docId)
  sessions.delete(share.docId)
  await session?.stop()
  status[share.docId] = 'stopped'
}

async function toggle(share: Share) {
  share.active = !sessions.has(share.docId)
  await saveShares()
  if (share.active) await start(share)
  else await stop(share)
}

async function pickFolder(): Promise<string | null> {
  const folder = await open({ directory: true, multiple: false })
  if (!folder) return null
  if (shares.value.some((s) => s.folder === folder)) {
    toast.error('This folder is already shared.')
    return null
  }
  return folder
}

async function add(docId: string, server: string) {
  const folder = await pickFolder()
  if (!folder) return
  const share: Share = { docId, folder, server, active: true }
  shares.value.push(share)
  await saveShares()
  await start(share)
}

async function shareFolder() {
  if (!/^https?:\/\//.test(settings.value.server)) {
    showSettings.value = true
    return toast.error('Set the sync server URL first.')
  }
  await add(newDocId(), settings.value.server.replace(/\/+$/, ''))
}

async function joinFolder() {
  const link = parseLink(joinLink.value.trim(), settings.value.server || undefined)
  if (!link) return toast.error('That does not look like a project link.')
  if (shares.value.some((s) => s.docId === link.docId)) return toast.error('This project is already shared here.')
  await add(link.docId, link.server)
  joinLink.value = ''
}

async function removeShare(share: Share) {
  if (!confirm(`Stop sharing ${share.folder}? Files stay on disk.`)) return
  await stop(share)
  shares.value = shares.value.filter((s) => s.docId !== share.docId)
  await saveShares()
}

async function copyLink(share: Share) {
  if (!settings.value.editorUrl) {
    showSettings.value = true
    return toast.error('Set the editor URL first.')
  }
  await writeText(buildLink(settings.value.editorUrl, { docId: share.docId, server: share.server }))
  toast.success('Link copied.')
}

async function onSaveSettings() {
  settings.value.server = settings.value.server.trim().replace(/\/+$/, '')
  settings.value.editorUrl = settings.value.editorUrl.trim()
  await saveSettings()
  showSettings.value = false
  toast.success('Settings saved.')
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
    <header class="flex items-center gap-2">
      <h1 class="flex-1 text-lg font-semibold">take-my-typst</h1>
      <button class="btn btn-ghost btn-sm btn-square" title="Settings" @click="showSettings = !showSettings">
        <Settings class="size-4" />
      </button>
    </header>

    <form v-if="showSettings" class="card card-border bg-base-100" @submit.prevent="onSaveSettings">
      <div class="card-body gap-3">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Sync server</legend>
          <input v-model="settings.server" class="input w-full" placeholder="https://sync.example.org" inputmode="url" />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Web editor</legend>
          <input v-model="settings.editorUrl" class="input w-full" placeholder="https://edit.example.org" inputmode="url" />
        </fieldset>
        <div class="card-actions justify-end"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>
      </div>
    </form>

    <div class="flex flex-col gap-2 sm:flex-row">
      <button class="btn btn-primary" @click="shareFolder"><FolderPlus class="size-4" /> Share a folder</button>
      <form class="join flex-1" @submit.prevent="joinFolder">
        <input v-model="joinLink" class="input join-item w-full" placeholder="…or paste a link to sync it into an empty folder" />
        <button class="btn join-item" type="submit" title="Sync link into a folder"><Link2 class="size-4" /></button>
      </form>
    </div>

    <p v-if="!shares.length" class="py-8 text-center text-sm opacity-60">No shared folders yet.</p>

    <ul class="flex flex-col gap-2">
      <li v-for="share in shares" :key="share.docId" class="card card-border bg-base-100">
        <div class="card-body flex-row flex-wrap items-center gap-2 p-3">
          <div class="min-w-0 flex-1">
            <div class="truncate font-mono text-sm" :title="share.folder">{{ share.folder }}</div>
            <div class="truncate text-xs opacity-60">{{ share.server }}</div>
          </div>
          <span class="badge badge-sm" :class="badge[status[share.docId] ?? 'stopped']">{{ status[share.docId] ?? 'stopped' }}</span>
          <div class="flex gap-1">
            <button class="btn btn-sm" title="Copy link" @click="copyLink(share)"><Copy class="size-4" /> Link</button>
            <button class="btn btn-ghost btn-sm btn-square" :title="share.active ? 'Stop syncing' : 'Start syncing'" @click="toggle(share)">
              <Square v-if="share.active" class="size-4" />
              <Play v-else class="size-4" />
            </button>
            <button class="btn btn-ghost btn-sm btn-square" title="Stop sharing" @click="removeShare(share)"><Trash2 class="size-4" /></button>
          </div>
        </div>
      </li>
    </ul>

    <p class="mt-auto text-xs opacity-50">Folders sync while this window is open.</p>
    <Toasts />
  </div>
</template>
