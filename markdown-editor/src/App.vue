<script setup lang="ts">
import { parseLink } from '@tmt/shared'; import { computed, onBeforeUnmount, ref } from 'vue'; import Landing from './components/Landing.vue'; import Toasts from './components/Toasts.vue'; import Workspace from './components/Workspace.vue'
const hash = ref(location.hash); const onHash = () => hash.value = location.hash; window.addEventListener('hashchange', onHash); onBeforeUnmount(() => window.removeEventListener('hashchange', onHash)); const link = computed(() => parseLink(hash.value, import.meta.env.VITE_DEFAULT_SERVER))
</script><template><Workspace v-if="link" :key="link.docId + link.server" :link="link" /><Landing v-else /><Toasts /></template>
