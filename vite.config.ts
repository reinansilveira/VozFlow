import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), crx({
    manifest,
    contentScripts: {
      standaloneFiles: ['vendor/wppconnect-wa.js', 'src/content/main-world.ts'],
    },
  })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: 'src/entries/dashboard/index.html',
        sidepanel: 'src/entries/sidepanel/index.html',
        quickbar: 'src/entries/quickbar/index.html',
      },
    },
  },
});
