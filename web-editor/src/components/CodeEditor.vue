<script setup lang="ts">
import { indentWithTab } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { getFiles } from '@tmt/shared'
import { EditorView, basicSetup } from 'codemirror'
import { typst_lezer } from 'codemirror-lang-typst/lezer'
import { onBeforeUnmount, ref, watch } from 'vue'
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'
import type { Project } from '../lib/project'

const props = defineProps<{ project: Project; path: string }>()
const el = ref<HTMLDivElement>()
let view: EditorView | null = null

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit' },
  '.cm-content': { caretColor: 'currentColor' },
  '.cm-cursor': { borderLeftColor: 'currentColor' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'color-mix(in oklab, currentColor 40%, transparent)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, currentColor 5%, transparent)' },
})

function mount() {
  view?.destroy()
  view = null
  const ytext = getFiles(props.project.doc).get(props.path)
  if (!ytext || !el.value) return
  view = new EditorView({
    parent: el.value,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        theme,
        props.path.endsWith('.typ') ? typst_lezer() : [],
        yCollab(ytext, props.project.awareness, { undoManager: new Y.UndoManager(ytext) }),
      ],
    }),
  })
}

/** Moves the cursor to a 0-based line and focuses the editor. */
function gotoLine(line: number) {
  if (!view) return
  const l = view.state.doc.line(Math.min(Math.max(line + 1, 1), view.state.doc.lines))
  view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true })
  view.focus()
}

watch([() => props.path, el], mount, { flush: 'post' })
onBeforeUnmount(() => view?.destroy())
defineExpose({ gotoLine })
</script>

<template>
  <div ref="el" class="h-full min-h-0 overflow-hidden"></div>
</template>
