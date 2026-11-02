import { readonly, ref } from 'vue'
export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export interface Toast { id: number; kind: ToastKind; message: string }
const items = ref<Toast[]>([]); let next = 1
function push(kind: ToastKind, message: string) { const id = next++; items.value.push({ id, kind, message }); setTimeout(() => { items.value = items.value.filter((x) => x.id !== id) }, 5000) }
export function useToast() { return { items: readonly(items), success: (m: string) => push('success', m), error: (m: string) => push('error', m), warning: (m: string) => push('warning', m), info: (m: string) => push('info', m) } }
