<script setup lang="ts">
import {
  ChevronDown,
  CloudOff,
  Download,
  FilePlus,
  FileText,
  Image,
  Link,
  Pencil,
  Star,
  Trash2,
  Upload,
  Users,
} from '@lucide/vue'
import {
  type DocLink,
  applyTextDiff,
  buildLink,
  classify,
  getBlobs,
  getFiles,
  getMeta,
  isIgnored,
  keyAvatar,
  mainFile,
  normalizePath,
} from '@tmt/shared'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as Y from 'yjs'
import { addBlob, checkSize } from '../lib/blobs'
import type { Diagnostic } from '../lib/compile-protocol'
import { useCompiler } from '../lib/compiler'
import { type Project, openProject } from '../lib/project'
import { useToast } from '../lib/toast'
import { loadName, randomName, saveName } from '../lib/user'
import BlobView from './BlobView.vue'
import CodeEditor from './CodeEditor.vue'
import PdfPreview from './PdfPreview.vue'
import PromptDialog from './PromptDialog.vue'

const props = defineProps<{ link: DocLink }>()
const toast = useToast()

const project = shallowRef<Project | null>(null)
const compiler = shallowRef<ReturnType<typeof useCompiler> | null>(null)
const current = ref<string | null>(null)
const main = ref<string | null>(null)
const tab = ref<'editor' | 'preview'>('editor')
const name = ref(loadName())
const showDiagnostics = ref(true)
const dragging = ref(false)
const prompt = ref<InstanceType<typeof PromptDialog>>()
const editor = ref<InstanceType<typeof CodeEditor>>()
const fileInput = ref<HTMLInputElement>()

let unmounted = false
openProject(props.link).then(
  (p) => {
    if (unmounted) return p.destroy()
    project.value = p
    compiler.value = useCompiler(p)
    const updateMain = () => (main.value = mainFile(p.doc))
    p.doc.on('update', updateMain)
    updateMain()
  },
  (e) => toast.error(`Could not open project: ${e}`),
)

onBeforeUnmount(() => {
  unmounted = true
  compiler.value?.destroy()
  project.value?.destroy()
})

const paths = computed(() => project.value?.paths.value ?? [])
const isText = (p: string) => !!project.value && getFiles(project.value.doc).has(p)

// Keep a valid selection: prefer the entry file, fall back to the first path.
watch([paths, main], () => {
  if (current.value && paths.value.includes(current.value)) return
  current.value = main.value ?? paths.value[0] ?? null
})

const diagnostics = computed(() => compiler.value?.diagnostics.value ?? [])
const errorCount = computed(() => diagnostics.value.filter((d) => d.severity === 'error').length)

const statusInfo = computed(() => {
  switch (project.value?.status.value) {
    case 'synced':
      return { cls: 'status-success', label: 'Synced' }
    case 'syncing':
      return { cls: 'status-warning', label: 'Syncing' }
    default:
      return { cls: 'status-neutral', label: 'Offline – changes are kept locally' }
  }
})

function commitName() {
  name.value = name.value.trim() || randomName()
  saveName(name.value)
  project.value?.setName(name.value)
}

function validNewPath(input: string | null): string | null {
  if (input == null) return null
  const p = normalizePath(input)
  if (!p || isIgnored(p) || !classify(p)) {
    toast.error('Use a relative path with a supported extension (.typ, .bib, .png, …).')
    return null
  }
  if (paths.value.includes(p)) {
    toast.error(`${p} already exists.`)
    return null
  }
  return p
}

async function newFile() {
  const p = validNewPath(await prompt.value!.ask('New file', paths.value.length ? 'chapter.typ' : 'main.typ'))
  if (!p || !project.value) return
  if (classify(p) !== 'text') return toast.error('Upload binary files instead.')
  getFiles(project.value.doc).set(p, new Y.Text(p.endsWith('.typ') && !main.value ? '= Untitled\n\n' : ''))
  select(p)
}

async function rename(from: string) {
  const to = validNewPath(await prompt.value!.ask(`Rename ${from}`, from))
  if (!to || !project.value) return
  const doc = project.value.doc
  if (classify(to) !== classify(from)) return toast.error('Renaming cannot change between text and binary.')
  doc.transact(() => {
    if (getFiles(doc).has(from)) {
      getFiles(doc).set(to, new Y.Text(getFiles(doc).get(from)!.toString()))
      getFiles(doc).delete(from)
    } else {
      getBlobs(doc).set(to, getBlobs(doc).get(from)!)
      getBlobs(doc).delete(from)
    }
    if (getMeta(doc).get('main') === from) getMeta(doc).set('main', to)
  })
  select(to)
}

function remove(path: string) {
  if (!project.value || !confirm(`Delete ${path}?`)) return
  const doc = project.value.doc
  doc.transact(() => {
    getFiles(doc).delete(path)
    getBlobs(doc).delete(path)
  })
}

function setMain(path: string) {
  project.value && getMeta(project.value.doc).set('main', path)
}

function select(path: string) {
  current.value = path
  tab.value = 'editor'
  ;(document.activeElement as HTMLElement | null)?.blur()
}

async function addFiles(files: FileList | File[]) {
  const p = project.value
  if (!p) return
  for (const file of files) {
    const path = normalizePath(file.name)
    const kind = path && classify(path)
    if (!path || !kind) {
      toast.error(`${file.name}: unsupported file type.`)
      continue
    }
    const size = checkSize(file.size)
    if (size === 'too-big') {
      toast.error(`${file.name} is too large (${(file.size / 1048576).toFixed(1)} MB).`)
      continue
    }
    if (size === 'warn') toast.warning(`${file.name} is large (${(file.size / 1048576).toFixed(1)} MB); consider shrinking it.`)
    if (kind === 'text') {
      const text = await file.text()
      const existing = getFiles(p.doc).get(path)
      if (existing) applyTextDiff(existing, text)
      else getFiles(p.doc).set(path, new Y.Text(text))
      continue
    }
    try {
      await addBlob(p.link, p.doc, path, new Uint8Array(await file.arrayBuffer()))
    } catch (e) {
      toast.warning(`${file.name} saved locally; upload will be retried when online. (${e instanceof Error ? e.message : e})`)
    }
  }
}

function onPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function onDrop(ev: DragEvent) {
  dragging.value = false
  if (ev.dataTransfer?.files.length) addFiles(ev.dataTransfer.files)
}

async function copyLink() {
  const url = buildLink(location.origin + location.pathname, props.link)
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied.')
  } catch {
    await prompt.value?.ask('Copy this link', url)
  }
}

function downloadPdf() {
  const pdf = compiler.value?.pdf.value
  if (!pdf) return toast.info('Nothing compiled yet.')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
  a.download = (main.value ?? 'document.typ').split('/').pop()!.replace(/\.typ$/, '.pdf')
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function gotoDiagnostic(d: Diagnostic) {
  if (!d.path || d.package || !paths.value.includes(d.path)) return
  select(d.path)
  setTimeout(() => editor.value?.gotoLine(d.line), 0)
}
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex items-center gap-1 border-b border-base-300 px-2 py-1">
      <div class="dropdown">
        <div tabindex="0" role="button" class="btn btn-ghost btn-sm max-w-[30vw] font-normal sm:max-w-[50vw]">
          <span class="truncate">{{ current ?? 'No files' }}</span>
          <ChevronDown class="size-4 shrink-0" />
        </div>
        <ul tabindex="0" class="dropdown-content menu z-20 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-box bg-base-100 p-2 shadow">
          <li v-for="p in paths" :key="p">
            <div class="flex items-center gap-2" :class="{ 'menu-active': p === current }" @click="select(p)">
              <FileText v-if="isText(p)" class="size-4 shrink-0" />
              <Image v-else class="size-4 shrink-0" />
              <span class="flex-1 truncate">{{ p }}</span>
              <Star v-if="p === main" class="size-3.5 shrink-0 fill-current" />
              <button v-else-if="p.endsWith('.typ')" class="btn btn-ghost btn-xs btn-square" title="Set as main file" @click.stop="setMain(p)">
                <Star class="size-3.5" />
              </button>
              <button class="btn btn-ghost btn-xs btn-square" title="Rename" @click.stop="rename(p)"><Pencil class="size-3.5" /></button>
              <button class="btn btn-ghost btn-xs btn-square" title="Delete" @click.stop="remove(p)"><Trash2 class="size-3.5" /></button>
            </div>
          </li>
          <li v-if="paths.length" class="menu-title p-0"><div class="divider my-1"></div></li>
          <li><button @click="newFile"><FilePlus class="size-4" /> New file</button></li>
          <li><button @click="fileInput?.click()"><Upload class="size-4" /> Upload files</button></li>
        </ul>
      </div>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onPick" />

      <div class="flex-1"></div>

      <div class="tooltip tooltip-bottom" :data-tip="statusInfo.label">
        <CloudOff v-if="project?.status.value === 'offline'" class="size-4 opacity-60" />
        <span v-else class="status mx-1" :class="statusInfo.cls"></span>
      </div>
      <span class="flex items-center gap-1 px-1 text-sm sm:px-2" title="Collaborators online">
        <Users class="size-4" />{{ project?.peers.value ?? 1 }}
      </span>
      <img :src="keyAvatar(link.key)" class="size-6 shrink-0 rounded" :title="`Access key ${link.key}`" alt="" />
      <input
        v-model="name"
        class="input input-ghost input-sm w-24 min-w-0 px-1 sm:w-40 sm:px-3"
        title="Your name (shown to collaborators)"
        autocomplete="off"
        autocapitalize="off"
        @change="commitName"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <button class="btn btn-ghost btn-sm btn-square" title="Copy link" @click="copyLink"><Link class="size-4" /></button>
      <button class="btn btn-ghost btn-sm btn-square" title="Download PDF" @click="downloadPdf"><Download class="size-4" /></button>
    </header>

    <div role="tablist" class="tabs tabs-border md:hidden">
      <button role="tab" class="tab flex-1" :class="{ 'tab-active': tab === 'editor' }" @click="tab = 'editor'">Editor</button>
      <button role="tab" class="tab flex-1" :class="{ 'tab-active': tab === 'preview' }" @click="tab = 'preview'">
        Preview<span v-if="errorCount" class="badge badge-error badge-xs ml-1">{{ errorCount }}</span>
      </button>
    </div>

    <main class="flex min-h-0 flex-1">
      <section
        class="min-w-0 flex-1 flex-col md:flex md:w-1/2 md:border-r md:border-base-300"
        :class="[tab === 'editor' ? 'flex' : 'hidden', dragging && 'bg-base-200']"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div v-if="!project" class="flex flex-1 items-center justify-center"><span class="loading loading-spinner"></span></div>
        <div v-else-if="!paths.length" class="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <p class="text-sm opacity-60">This project is empty, or still syncing.</p>
          <button class="btn btn-sm" @click="newFile"><FilePlus class="size-4" /> New file</button>
        </div>
        <template v-else-if="current">
          <CodeEditor v-if="isText(current)" ref="editor" :project="project" :path="current" class="flex-1" />
          <BlobView v-else :project="project" :path="current" class="flex-1" />
        </template>

        <div v-if="diagnostics.length" class="max-h-[30%] overflow-auto border-t border-base-300 text-xs">
          <button class="flex w-full items-center gap-2 px-3 py-1 text-left opacity-70" @click="showDiagnostics = !showDiagnostics">
            <span v-if="errorCount" class="text-error">{{ errorCount }} error{{ errorCount === 1 ? '' : 's' }}</span>
            <span v-if="diagnostics.length - errorCount" class="text-warning">{{ diagnostics.length - errorCount }} warning(s)</span>
            <ChevronDown class="ml-auto size-3.5 transition-transform" :class="{ 'rotate-180': !showDiagnostics }" />
          </button>
          <ul v-if="showDiagnostics">
            <li v-for="(d, i) in diagnostics" :key="i">
              <button class="w-full px-3 py-1 text-left font-mono hover:bg-base-200" @click="gotoDiagnostic(d)">
                <span :class="d.severity === 'error' ? 'text-error' : 'text-warning'">{{ d.package ? `${d.package}:` : '' }}{{ d.path || '?' }}:{{ d.line + 1 }}</span>
                {{ d.message }}
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section class="min-w-0 flex-1 md:block md:w-1/2" :class="tab === 'preview' ? 'block' : 'hidden'">
        <PdfPreview :pdf="compiler?.pdf.value ?? null" :compiling="compiler?.compiling.value ?? false" />
      </section>
    </main>

    <PromptDialog ref="prompt" />
  </div>
</template>
