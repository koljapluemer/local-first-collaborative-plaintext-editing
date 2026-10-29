<script setup lang="ts">
import { FileDown } from '@lucide/vue'
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ pdf: Uint8Array | null; compiling: boolean }>()
const url = ref<string | null>(null)
// Android Chrome and some mobile browsers cannot show PDFs inline.
const inline = navigator.pdfViewerEnabled !== false

watch(
  () => props.pdf,
  (pdf) => {
    const old = url.value
    url.value = pdf ? URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })) : null
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))
</script>

<template>
  <div class="relative h-full w-full bg-base-200">
    <span v-if="compiling" class="loading loading-spinner loading-xs absolute top-2 right-2 opacity-50"></span>
    <iframe v-if="url && inline" :src="url" class="h-full w-full border-0" title="PDF preview"></iframe>
    <div v-else-if="url" class="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p class="text-sm opacity-70">This browser cannot display PDFs inline.</p>
      <a :href="url" target="_blank" class="btn"><FileDown class="size-4" /> Open PDF</a>
    </div>
    <div v-else class="flex h-full items-center justify-center text-sm opacity-50">No output yet</div>
  </div>
</template>
