<script setup lang="ts">
import { nextTick, ref } from 'vue'

const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const title = ref('')
const value = ref('')
let resolver: ((v: string | null) => void) | null = null

/** Opens the dialog and resolves with the entered value, or null if cancelled. */
function ask(t: string, initial = ''): Promise<string | null> {
  title.value = t
  value.value = initial
  dialog.value?.showModal()
  nextTick(() => input.value?.select())
  return new Promise((resolve) => (resolver = resolve))
}

function finish(v: string | null) {
  resolver?.(v)
  resolver = null
  dialog.value?.close()
}

defineExpose({ ask })
</script>

<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" @close="finish(null)">
    <form class="modal-box flex flex-col gap-3" @submit.prevent="finish(value.trim() || null)">
      <h3 class="font-semibold">{{ title }}</h3>
      <input ref="input" v-model="value" class="input w-full" autocomplete="off" autocapitalize="off" />
      <div class="modal-action mt-0">
        <button type="button" class="btn btn-ghost" @click="finish(null)">Cancel</button>
        <button type="submit" class="btn btn-primary">OK</button>
      </div>
    </form>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>
</template>
