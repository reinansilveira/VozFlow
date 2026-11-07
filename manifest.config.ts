import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'VozFlow',
  version: '1.1.0',
  description: 'Mensagens, áudios e funis para o WhatsApp Web.',
  minimum_chrome_version: '137',
  permissions: ['alarms', 'scripting', 'storage', 'tabs'],
  host_permissions: ['https://web.whatsapp.com/*'],
  action: {
    default_title: 'Abrir VozFlow',
    default_popup: 'src/entries/popup/index.html',
  },
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://web.whatsapp.com/*'],
      js: ['vendor/wppconnect-wa.js', 'src/content/main-world.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://web.whatsapp.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/entries/dashboard/index.html', 'src/entries/sidepanel/index.html', 'src/entries/quickbar/index.html', 'assets/*', 'vendor/*'],
      matches: ['https://web.whatsapp.com/*'],
    },
  ],
};

export default manifest;
