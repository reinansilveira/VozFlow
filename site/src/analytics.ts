// Medição de anúncios (Meta Pixel e Google Analytics 4), carregada só depois do consentimento (LGPD).
// Sem VITE_META_PIXEL_ID nem VITE_GA_ID no build, nada é carregado e o aviso de cookies não aparece.

type Consent = 'aceito' | 'recusado';
type TrackedEvent = { meta: string; metaParams?: Record<string, string>; ga: string; gaParams?: Record<string, string> };

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...args: unknown[]) => void };
    _fbq?: unknown;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const consentKey = 'vozflow.consent';
const metaPixelId = import.meta.env.VITE_META_PIXEL_ID || '';
const gaId = import.meta.env.VITE_GA_ID || '';

// Cada clique marcado com data-track vira um evento padrão de cada plataforma.
export const eventForTrack = (track: string, plan = ''): TrackedEvent | null => {
  if (track === 'teste' || track === 'instalar') return { meta: 'Lead', ga: 'generate_lead', gaParams: { origem: track } };
  if (track === 'assinar') {
    return { meta: 'InitiateCheckout', metaParams: { content_name: plan }, ga: 'begin_checkout', gaParams: { plano: plan } };
  }
  if (track === 'whatsapp') return { meta: 'Contact', ga: 'contact' };
  return null;
};

const readConsent = (): Consent | null => {
  try {
    const value = window.localStorage.getItem(consentKey);
    return value === 'aceito' || value === 'recusado' ? value : null;
  } catch {
    return null;
  }
};

const saveConsent = (value: Consent) => {
  try {
    window.localStorage.setItem(consentKey, value);
  } catch {
    // Sem armazenamento local, a escolha vale só para esta visita.
  }
};

const loadScript = (src: string) => {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.append(script);
};

const loadMetaPixel = (id: string) => {
  if (window.fbq) return;
  const queue: unknown[] = [];
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else queue.push(args);
  }) as NonNullable<Window['fbq']>;
  fbq.queue = queue;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
  fbq('track', 'PageView');
};

const loadGoogleAnalytics = (id: string) => {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  window.gtag('js', new Date());
  window.gtag('config', id);
};

const startMeasurement = () => {
  if (metaPixelId) loadMetaPixel(metaPixelId);
  if (gaId) loadGoogleAnalytics(gaId);
};

const trackClicks = () => {
  document.addEventListener('click', (event) => {
    if (readConsent() !== 'aceito') return;
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-track]');
    const tracked = target ? eventForTrack(target.dataset.track ?? '', target.dataset.plan) : null;
    if (!tracked) return;
    window.fbq?.('track', tracked.meta, tracked.metaParams ?? {});
    window.gtag?.('event', tracked.ga, tracked.gaParams ?? {});
  });
};

const showBanner = (onChoice: (value: Consent) => void) => {
  const banner = document.createElement('section');
  banner.className = 'consent';
  banner.setAttribute('aria-label', 'Aviso de cookies');

  const text = document.createElement('p');
  text.className = 'consent__text';
  text.append('Usamos cookies para medir nossos anúncios e melhorar o site. Veja a ');
  const link = document.createElement('a');
  link.href = '/privacidade/#site';
  link.textContent = 'Política de Privacidade';
  text.append(link, '.');

  const actions = document.createElement('div');
  actions.className = 'consent__actions';
  const choose = (value: Consent, label: string, modifier: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button button--small ${modifier}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      banner.remove();
      onChoice(value);
    });
    return button;
  };
  actions.append(choose('recusado', 'Recusar', 'button--outline'), choose('aceito', 'Aceitar', 'button--primary'));

  banner.append(text, actions);
  document.body.append(banner);
};

// Link "Cookies" no rodapé para rever a escolha a qualquer momento.
const addPreferencesLink = (onChange: () => void) => {
  const list = document.querySelector('.footer__meta');
  if (!list) return;
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'footer__meta-link footer__meta-button';
  button.textContent = 'Cookies';
  button.addEventListener('click', onChange);
  item.append(button);
  list.append(item);
};

export const setupAnalytics = () => {
  if (!metaPixelId && !gaId) return;

  const decide = (value: Consent) => {
    saveConsent(value);
    if (value === 'aceito') startMeasurement();
  };

  trackClicks();
  addPreferencesLink(() => showBanner((value) => {
    decide(value);
    // Recusar depois de aceitar só tem efeito completo ao recarregar, quando os scripts deixam de ser carregados.
    if (value === 'recusado' && (window.fbq || window.gtag)) window.location.reload();
  }));

  const consent = readConsent();
  if (consent === 'aceito') startMeasurement();
  if (!consent) showBanner(decide);
};
