<script setup lang="ts">
import { DEFAULT_MARKDOWN_CSS, getFiles } from '@tmt/shared'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Project } from '../lib/project'
import { renderMarkdown } from '../lib/render'
const props = defineProps<{ project: Project; entry: string | null }>()
const host = ref<HTMLDivElement>(); const warnings = ref<string[]>([]); const error = ref(''); let timer: ReturnType<typeof setTimeout> | undefined; let urls: string[] = []; let seq = 0
function cleanup(next: string[] = []) { for (const url of urls) URL.revokeObjectURL(url); urls = next }
async function render() {
  const entry = props.entry, root = host.value?.shadowRoot; if (!entry || !root) return
  const text = getFiles(props.project.doc).get(entry)?.toString(); if (text == null) return
  const mine = ++seq
  try {
    const result = await renderMarkdown(props.project, entry, text, getFiles(props.project.doc).get('styles.css')?.toString() ?? DEFAULT_MARKDOWN_CSS)
    if (mine !== seq) { result.urls.forEach(URL.revokeObjectURL); return }
    cleanup(result.urls); warnings.value = result.warnings; error.value = ''
    root.innerHTML = ''; const style = document.createElement('style'); style.textContent = result.css; const article = document.createElement('article'); article.className = 'markdown-body'; article.innerHTML = result.html; root.append(style, article)
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
function schedule() { clearTimeout(timer); timer = setTimeout(render, 250) }
onMounted(() => { host.value!.attachShadow({ mode: 'open' }); props.project.doc.on('update', schedule); render() })
watch(() => props.entry, schedule); onBeforeUnmount(() => { clearTimeout(timer); props.project.doc.off('update', schedule); cleanup(); seq++ })
</script>
<template><div class="relative h-full min-h-0"><div ref="host" class="block h-full overflow-auto"></div><div v-if="error || warnings.length" class="absolute bottom-2 left-2 right-2 max-h-28 overflow-auto rounded bg-warning/90 p-2 text-xs text-warning-content"><div v-if="error">{{ error }}</div><div v-for="warning in warnings" :key="warning">{{ warning }}</div></div></div></template>
