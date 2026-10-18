import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: { assetsInlineLimit: 0 },
  worker: { format: 'es' },
});
