# VozFlow

Extensão Chrome para organizar mensagens, áudios, imagens e funis no WhatsApp Web.

## Base técnica

- React + TypeScript para popup, opções e painel lateral.
- Vite + CRXJS para gerar a extensão Manifest V3.
- Sass com BEM, tokens e mixins compartilhados.
- Scripts separados para background, content script e página do WhatsApp.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build e instalação local

```bash
npm run build
```

O pacote será criado em `dist/`. Abra `chrome://extensions`, ative o modo de desenvolvedor e carregue a pasta `dist/` sem compactação.

Depois de atualizar o código, clique em **Recarregar** no cartão do VozFlow e atualize a aba do WhatsApp Web uma vez. Isso substitui também os scripts que já estavam carregados na página.

## Site (landing page)

```bash
npm run site:dev      # http://localhost:5180
npm run site:build    # gera site/dist/
npm run site:preview  # serve o build em http://localhost:5181
```

A logo vetorizada fica em `site/public/brand/`.

Quando houver domínio, informe-o no build para gerar URLs absolutas, `sitemap.xml` e o `Sitemap` do `robots.txt`:

```bash
SITE_URL=https://www.seudominio.com.br npm run site:build
```

Também é possível salvar `SITE_URL=...` em `site/.env`.

No Netlify, o `netlify.toml` já define o build (`npm run site:build`, publicando `site/dist/`). Sem `SITE_URL`, vale o endereço principal do site no Netlify. Para verificar o site no Google Search Console pela meta tag, defina `SITE_GOOGLE_VERIFICATION=<código>` nas variáveis do Netlify.

Avisos de atividade real ("Alguém de Sergipe assinou o plano Pro"): defina `VITE_ACTIVITY_URL=https://<projeto>.supabase.co/functions/v1/recent-activity` em `site/.env`. Sem essa variável, os avisos usam a lista cadastrada à mão em `site/src/activity-events.ts` (com o dia e a hora de cada compra no horário de Brasília, `AAAA-MM-DD HH:mm`; na tela aparece só "há X min/h"), tanto no `site:dev` quanto no build.

Medição de anúncios (opcional): `VITE_META_PIXEL_ID=...` e/ou `VITE_GA_ID=G-...` em `site/.env`. Com eles, o site mostra o aviso de cookies e só carrega o Pixel e o Google Analytics depois do "Aceitar".

## Licenças (Supabase)

O backend de licenças, teste grátis e webhook da Cakto fica em `supabase/` (migrations e Edge Functions). Para rodar localmente (precisa de Docker):

```bash
npx supabase@2 start
node scripts/gerar-chaves-passe.mjs > supabase/functions/.env   # depois acrescente CAKTO_WEBHOOK_SECRET=...
npx supabase@2 functions serve --env-file supabase/functions/.env
```

Em produção, crie o projeto no Supabase, rode `npx supabase@2 link` e `npx supabase@2 db push`, publique as funções com `npx supabase@2 functions deploy` e cadastre `LICENSE_PASS_PRIVATE_KEY` e `CAKTO_WEBHOOK_SECRET` com `npx supabase@2 secrets set`. A chave pública (`VITE_LICENSE_PUBLIC_KEY`) entra no build da extensão. Nunca versionar a chave privada nem o segredo da Cakto.

A extensão só envia com licença ou teste ativo. Antes de `npm run build`, copie `.env.example` para `.env` e preencha `VITE_LICENSE_API_URL` e `VITE_LICENSE_PUBLIC_KEY` (local: `http://127.0.0.1:54321/functions/v1`). Sem esses valores, o painel mostra "Licenciamento indisponível" e os envios ficam bloqueados. É preciso Chrome 137 ou mais recente.

### Painel admin

```bash
cp admin/.env.example admin/.env   # preencha URL e chave anon do Supabase
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-admin.mjs voce@exemplo.com
npm run admin:dev                  # http://localhost:5190
npm run admin:build                # gera admin/dist/ para publicar (Vercel, Netlify...)
```

No primeiro login, o painel pede para cadastrar um app autenticador (verificação em duas etapas).

Webhook da Cakto: `https://<projeto>.supabase.co/functions/v1/cakto-webhook`, com os eventos de compra, reembolso, chargeback e assinatura. Cada oferta (mensal e anual) precisa estar ligada a um plano em `plans.cakto_offer_id`.

## Estrutura

```text
public/       Manifesto e dependências estáticas
src/
  background/ Service worker
  content/    Integração com WhatsApp Web
  entries/    Popup, opções e painel lateral React
  shared/     Componentes, serviços, tipos e estilos compartilhados
```

As regras de arquitetura e implementação estão em `SPEC.md` e `AGENTS.md`. Nenhum commit é criado sem autorização explícita.
