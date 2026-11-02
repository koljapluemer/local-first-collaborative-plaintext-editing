<script setup lang="ts">import { useToast } from '../lib/toast'; const toast = useToast()</script>
<template><div class="toast toast-top toast-end z-50"><div v-for="item in toast.items.value" :key="item.id" class="alert" :class="`alert-${item.kind}`"><span>{{ item.message }}</span></div></div></template>
