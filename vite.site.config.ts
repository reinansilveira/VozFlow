import { defineConfig, loadEnv, type Plugin } from 'vite';

// Páginas publicadas; cada uma vira uma entrada do build e do sitemap.
export const sitePages = [
  '/',
  '/guias/',
  '/guias/enviar-audio-pronto-whatsapp-web/',
  '/guias/agendar-mensagem-whatsapp-web/',
  '/guias/mensagens-prontas-whatsapp-web/',
  '/guias/funil-de-vendas-whatsapp/',
  '/privacidade/',
  '/termos/',
];

// Domínio público do site, sem barra final (ex.: https://www.vozflow.com.br).
// No Netlify, sem SITE_URL, vale o endereço principal do site (variável URL do build).
// Sem nenhum dos dois, as URLs ficam relativas e o sitemap não é gerado.
export const normalizeSiteUrl = (value = '') => value.trim().replace(/\/+$/, '');

// Meta de verificação do Google Search Console, só quando o código for informado.
export const googleVerificationTag = (code = '') => (
  code.trim() ? `<meta name="google-site-verification" content="${code.trim()}" />` : ''
);

export const seoFiles = (siteUrl: string, googleVerification = ''): Plugin => ({
  name: 'vozflow-seo-files',
  transformIndexHtml: (html) => html
    .replaceAll('%SITE_URL%', siteUrl)
    .replace('</head>', `${googleVerificationTag(googleVerification)}</head>`),
  generateBundle() {
    const robots = ['User-agent: *', 'Allow: /'];

    if (siteUrl) {
      robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...sitePages.map((page) => `  <url><loc>${siteUrl}${page}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`),
          '</urlset>',
          '',
        ].join('\n'),
      });
    }

    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, 'site', ['SITE_', 'URL']);
  const siteUrl = normalizeSiteUrl(env.SITE_URL || env.URL);

  return {
    root: 'site',
    publicDir: 'public',
    plugins: [seoFiles(siteUrl, env.SITE_GOOGLE_VERIFICATION)],
    server: {
      port: 5180,
    },
    preview: {
      port: 5181,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
      cssMinify: true,
      assetsInlineLimit: 0,
      rollupOptions: {
        input: Object.fromEntries(sitePages.map((page) => [
          page === '/' ? 'index' : page.replace(/^\/|\/$/g, '').replace(/\//g, '-'),
          decodeURIComponent(new URL(`./site${page}index.html`, import.meta.url).pathname),
        ])),
      },
    },
  };
});
