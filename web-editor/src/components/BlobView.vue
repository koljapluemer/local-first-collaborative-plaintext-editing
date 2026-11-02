<script setup lang="ts">
import { getBlobs } from '@tmt/shared'
import { onBeforeUnmount, ref, watch } from 'vue'
import { getBlobBytes } from '../lib/blobs'
import type { Project } from '../lib/project'

const props = defineProps<{ project: Project; path: string }>()
const url = ref<string | null>(null)
const error = ref('')
const info = ref('')

watch(
  () => props.path,
  async (path) => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
    error.value = ''
    const ref = getBlobs(props.project.doc).get(path)
    if (!ref) return
    info.value = `${ref.mime}, ${(ref.size / 1024).toFixed(0)} KiB`
    if (!ref.mime.startsWith('image/') && !ref.mime.startsWith('video/')) return
    try {
      const bytes = await getBlobBytes(props.project.link, ref.hash)
      url.value = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: ref.mime }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 overflow-auto p-4">
    <img v-if="url && info.startsWith('image/')" :src="url" :alt="path" class="max-h-[70%] max-w-full object-contain" />
    <video v-else-if="url && info.startsWith('video/')" :src="url" controls class="max-h-[70%] max-w-full" />
    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <p class="text-sm opacity-60">{{ path }} · {{ info }}</p>
  </div>
</template>
