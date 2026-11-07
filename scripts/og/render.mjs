// Gera site/public/brand/og-image.jpg (1200×630) a partir de og-image.html.
// Uso: node scripts/og/render.mjs (precisa do pacote playwright com Chromium instalado).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const html = new URL('./og-image.html', import.meta.url);
const out = fileURLToPath(new URL('../../site/public/brand/og-image.jpg', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(html.href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log('ok', out);
