<script setup lang="ts">
import { buildLink, newDocId, parseLink } from '@tmt/shared'
import { ref } from 'vue'
import { useToast } from '../lib/toast'

const toast = useToast()
const input = ref('')
const defaultServer = import.meta.env.VITE_DEFAULT_SERVER ?? ''
const server = ref(defaultServer)

function open() {
  const link = parseLink(input.value.trim(), defaultServer || undefined)
  if (!link) return toast.error('That does not look like a project link.')
  location.hash = new URL(buildLink(location.origin, link)).hash
}

function create() {
  const link = parseLink(`#d=${newDocId()}&s=${encodeURIComponent(server.value.trim())}`)
  if (!link) return toast.error('Enter the http(s) URL of a sync server.')
  if (new URL(link.server).hostname === '0.0.0.0') return toast.error('0.0.0.0 is a bind address; use localhost or the server’s hostname.')
  location.hash = new URL(buildLink(location.origin, link)).hash
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center p-4 bg-base-200">
    <div class="card bg-base-100 w-full max-w-md shadow-sm">
      <div class="card-body gap-4">
        <h1 class="card-title">take-my-typst</h1>
        <form class="flex flex-col gap-2" @submit.prevent="open">
          <label class="label" for="link">Project link</label>
          <input id="link" v-model="input" class="input w-full" placeholder="https://…/#d=…" autocomplete="off" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        <div class="divider my-0">or</div>
        <form class="flex flex-col gap-2" @submit.prevent="create">
          <label class="label" for="server">Sync server</label>
          <input id="server" v-model="server" class="input w-full" placeholder="https://sync.example.org" inputmode="url" />
          <button class="btn" type="submit">New empty project</button>
        </form>
      </div>
    </div>
  </div>
</template>
