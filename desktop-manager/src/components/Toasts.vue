<script setup lang="ts">
import { useToast } from '../lib/toast'

const { toasts, dismiss } = useToast()
const cls = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', error: 'alert-error' }
</script>

<template>
  <div class="toast toast-end z-50">
    <div v-for="t in toasts" :key="t.id" role="alert" class="alert alert-soft max-w-sm" :class="cls[t.kind]" @click="dismiss(t.id)">
      <span class="text-sm break-words whitespace-normal">{{ t.message }}</span>
    </div>
  </div>
</template>
