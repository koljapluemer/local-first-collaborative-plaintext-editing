import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 1

function push(kind: ToastKind, message: string, ms = kind === 'error' ? 6000 : 3000) {
  const id = nextId++
  toasts.value.push({ id, kind, message })
  setTimeout(() => dismiss(id), ms)
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/** The single toast pattern of the app; rendered by Toasts.vue. */
export function useToast() {
  return {
    toasts,
    dismiss,
    info: (m: string) => push('info', m),
    success: (m: string) => push('success', m),
    warning: (m: string) => push('warning', m),
    error: (m: string) => push('error', m),
  }
}
