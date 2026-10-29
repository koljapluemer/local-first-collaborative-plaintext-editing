<script setup lang="ts">
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ pdf: Uint8Array | null; compiling: boolean }>()
const scroller = ref<HTMLDivElement>()
const pages = ref<HTMLDivElement>()
const rendered = ref(false)

// Pages are rendered off-screen and swapped in at once, so recompiles don't flash or lose scroll position.
let seq = 0
async function render() {
  const pdf = props.pdf
  const box = scroller.value
  if (!pdf || !box || !pages.value || !box.clientWidth) return
  const mine = ++seq
  // pdf.js transfers (detaches) the buffer it is given; the compiler's copy is still needed for download.
  const task = getDocument({ data: pdf.slice() })
  try {
    const doc = await task.promise
    const width = box.clientWidth - 16
    const dpr = window.devicePixelRatio || 1
    const canvases: HTMLCanvasElement[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${width}px`
      canvas.className = 'bg-white shadow'
      await page.render({ canvas, viewport }).promise
      if (mine !== seq) return
      canvases.push(canvas)
    }
    const top = box.scrollTop
    pages.value.replaceChildren(...canvases)
    box.scrollTop = top
    rendered.value = true
  } finally {
    task.destroy()
  }
}

watch(() => props.pdf, render)

let resizeTimer: ReturnType<typeof setTimeout> | undefined
let lastWidth = 0
const ro = new ResizeObserver(([entry]) => {
  const w = entry.contentRect.width
  if (w === lastWidth) return
  lastWidth = w
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(render, 150)
})
onMounted(() => ro.observe(scroller.value!))
onBeforeUnmount(() => {
  ro.disconnect()
  clearTimeout(resizeTimer)
  seq++
})
</script>

<template>
  <div class="relative h-full w-full bg-base-200">
    <span v-if="compiling" class="loading loading-spinner loading-xs absolute top-2 right-4 z-10 opacity-50"></span>
    <div ref="scroller" class="h-full w-full overflow-y-auto">
      <div ref="pages" class="flex flex-col items-center gap-2 py-2"></div>
    </div>
    <div v-if="!rendered" class="absolute inset-0 flex items-center justify-center text-sm opacity-50">
      {{ pdf ? 'Rendering…' : 'No output yet' }}
    </div>
  </div>
</template>
