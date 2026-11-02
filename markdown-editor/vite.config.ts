import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({ base: './', plugins: [vue(), tailwindcss()], build: { target: 'es2022', chunkSizeWarningLimit: 2000 } })
