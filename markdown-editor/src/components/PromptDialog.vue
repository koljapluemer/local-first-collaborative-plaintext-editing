<script setup lang="ts">
import { nextTick, ref } from 'vue'
const dialog = ref<HTMLDialogElement>(), input = ref<HTMLInputElement>(), title = ref(''), value = ref(''); let resolve: ((v: string | null) => void) | null = null
async function ask(t: string, initial = '') { title.value = t; value.value = initial; dialog.value!.showModal(); await nextTick(); input.value?.select(); return new Promise<string | null>((r) => resolve = r) }
function finish(v: string | null) { dialog.value?.close(); resolve?.(v); resolve = null }
defineExpose({ ask })
</script>
<template><dialog ref="dialog" class="modal" @cancel.prevent="finish(null)"><div class="modal-box"><h3 class="font-bold">{{ title }}</h3><form class="mt-4 flex gap-2" @submit.prevent="finish(value)"><input ref="input" v-model="value" class="input min-w-0 flex-1" /><button class="btn btn-primary">OK</button><button type="button" class="btn" @click="finish(null)">Cancel</button></form></div></dialog></template>
