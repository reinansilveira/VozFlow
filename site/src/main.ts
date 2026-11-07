import './styles/main.scss';
import { setupAnalytics } from './analytics';
import { activityBadge, activityTime, activityTone, describeActivity, parseActivity, type ActivityEvent } from './activity';
import { manualEvents } from './activity-events';
import { proofAvatars, proofHeadline, proofStats, type ProofAvatar, type ProofStat } from './social-proof';

const OPEN_CLASS = 'nav--open';

export const setupMenu = () => {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');

  if (!toggle || !menu) return;

  const setOpen = (open: boolean) => {
    menu.classList.toggle(OPEN_CLASS, open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains(OPEN_CLASS)));
  menu.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains(OPEN_CLASS)) {
      setOpen(false);
      toggle.focus();
    }
  });
};

export const setupYear = () => {
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Revela as seções conforme entram na tela. Sem suporte ou com movimento reduzido, tudo fica visível.
export const setupReveal = () => {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!items.length || prefersReducedMotion() || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  items.forEach((item) => observer.observe(item));
  document.documentElement.classList.add('reveal-ready');
};

// Barra de progresso de leitura, CTA fixo no celular depois do hero e leve parallax na demonstração.
export const setupScrollEffects = () => {
  const progress = document.querySelector<HTMLElement>('[data-progress]');
  const sticky = document.querySelector<HTMLElement>('[data-sticky-cta]');
  const parallax = document.querySelector<HTMLElement>('[data-parallax]');
  const hero = document.querySelector<HTMLElement>('.hero');
  const finalCta = document.querySelector<HTMLElement>('#teste-gratis');
  const reduced = prefersReducedMotion();
  let frame = 0;

  const update = () => {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;

    if (sticky && hero) {
      const pastHero = hero.getBoundingClientRect().bottom < 0;
      const atFinalCta = finalCta ? finalCta.getBoundingClientRect().top < window.innerHeight : false;
      sticky.classList.toggle('sticky-cta--visible', pastHero && !atFinalCta);
    }

    if (parallax && !reduced && window.scrollY < window.innerHeight) {
      parallax.style.transform = `translateY(${window.scrollY * -0.06}px)`;
    }
  };

  window.addEventListener('scroll', () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  }, { passive: true });
  update();
};

// Alterna os preços entre mensal e anual a partir dos atributos data-* dos cartões.
export const setupPricing = () => {
  const section = document.querySelector<HTMLElement>('[data-pricing]');
  if (!section) return;
  const options = section.querySelectorAll<HTMLButtonElement>('[data-period-option]');

  const apply = (period: string) => {
    section.dataset.period = period;
    options.forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.periodOption === period)));
    section.querySelectorAll<HTMLElement>(`[data-price-${period}]`).forEach((price) => {
      price.textContent = price.getAttribute(`data-price-${period}`);
    });
    section.querySelectorAll<HTMLElement>(`[data-billing-${period}]`).forEach((billing) => {
      billing.textContent = billing.getAttribute(`data-billing-${period}`);
    });
    // Preço mensal riscado só no anual, para mostrar a economia.
    section.querySelectorAll<HTMLElement>(`[data-old-${period}]`).forEach((old) => {
      old.textContent = old.getAttribute(`data-old-${period}`);
      old.hidden = !old.textContent;
    });
  };

  options.forEach((option) => option.addEventListener('click', () => apply(option.dataset.periodOption ?? 'anual')));
};

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const secondsPerVozFlowSend = 5;

// Calculadora de tempo recuperado: (minutos por envio − 5 s) × envios por dia × dias.
export const setupCalculator = () => {
  const root = document.querySelector<HTMLElement>('[data-calculator]');
  if (!root) return;
  const input = (name: string) => root.querySelector<HTMLInputElement>(`[data-calc-input="${name}"]`);
  const write = (selector: string, value: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  };

  const update = () => {
    const perDay = Number(input('per-day')?.value ?? 0);
    const minutes = Number(input('minutes')?.value ?? 0);
    const days = Number(input('days')?.value ?? 0);
    const savedMinutes = Math.max(0, minutes - secondsPerVozFlowSend / 60) * perDay * days;
    const hoursPerMonth = savedMinutes / 60;

    write('[data-calc-out="per-day"]', String(perDay));
    write('[data-calc-out="minutes"]', decimal.format(minutes));
    write('[data-calc-out="days"]', String(days));
    write('[data-calc-result="hours"]', decimal.format(Math.round(hoursPerMonth)));
    write('[data-calc-result="days"]', decimal.format(Math.round((hoursPerMonth * 12) / 8)));
  };

  root.querySelectorAll('input[type="range"]').forEach((range) => range.addEventListener('input', update));
  update();
};

// Vídeo do hero: a capa com play some no clique e o vídeo toca com som e controles.
export const setupHeroVideo = () => {
  const root = document.querySelector<HTMLElement>('[data-hero-video]');
  const video = root?.querySelector('video');
  const play = root?.querySelector<HTMLButtonElement>('[data-hero-play]');
  if (!root || !video || !play) return;

  play.addEventListener('click', () => {
    root.classList.add('hero-video--playing');
    video.controls = true;
    void video.play();
    video.focus();
  });
};

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

// "10,4 mil" vira o número em destaque e a unidade colorida, como em "10,4 mil".
const renderStatValue = (element: HTMLElement, value: number, suffix = '') => {
  const parts = compact.formatToParts(value);
  const unit = parts.filter((part) => part.type === 'compact').map((part) => part.value).join('');
  const number = parts.filter((part) => part.type !== 'compact' && part.type !== 'literal').map((part) => part.value).join('');
  const unitElement = document.createElement('span');
  unitElement.className = 'social__unit';
  unitElement.textContent = `${unit}${suffix}`;
  element.replaceChildren(number, unitElement);
};

const countUp = (element: HTMLElement, stat: ProofStat) => {
  if (prefersReducedMotion()) return renderStatValue(element, stat.value, stat.suffix);
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / 1400);
    renderStatValue(element, Math.round(stat.value * (1 - (1 - progress) ** 3)), stat.suffix);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
};

// Monta a seção de prova social a partir de social-proof.ts; sem números reais ela fica escondida.
// No `site:dev` (e só nele), sem dados reais, mostra exemplos para ver o visual.
export const setupSocialProof = async () => {
  const section = document.querySelector<HTMLElement>('[data-social-proof]');
  if (!section) return;

  let headline = proofHeadline;
  let avatars: ProofAvatar[] = proofAvatars;
  let stats: ProofStat[] = proofStats;
  if (import.meta.env.DEV && !stats.length) {
    const preview = await import('./social-proof-preview');
    headline = preview.previewHeadline;
    avatars = preview.previewAvatars;
    stats = preview.previewStats;
  }
  if (!stats.length) return;

  const crowd = section.querySelector<HTMLElement>('[data-social-crowd]');
  const avatarList = section.querySelector<HTMLElement>('[data-social-avatars]');
  const headlineElement = section.querySelector<HTMLElement>('[data-social-headline]');
  if (crowd && headline) {
    if (headlineElement) headlineElement.textContent = headline;
    avatars.forEach((avatar) => {
      const item = document.createElement('li');
      item.className = 'social__avatar';
      if (avatar.src) {
        const image = document.createElement('img');
        image.src = avatar.src;
        image.alt = avatar.alt;
        image.width = 44;
        image.height = 44;
        image.loading = 'lazy';
        item.append(image);
      } else if (avatar.icon) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon icon--small');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#${avatar.icon}`);
        svg.append(use);
        item.append(svg);
        item.title = avatar.alt;
      } else {
        item.textContent = avatar.initials ?? '';
        item.setAttribute('aria-hidden', 'true');
      }
      avatarList?.append(item);
    });
    crowd.hidden = false;
  }

  const statsList = section.querySelector<HTMLElement>('[data-social-stats]');
  const counters: Array<[HTMLElement, ProofStat]> = [];
  stats.forEach((stat) => {
    const item = document.createElement('li');
    item.className = 'social__stat';
    const value = document.createElement('strong');
    value.className = 'social__value';
    renderStatValue(value, stat.value, stat.suffix);
    const label = document.createElement('span');
    label.className = 'social__label';
    label.textContent = stat.label;
    item.append(value, label);
    statsList?.append(item);
    counters.push([value, stat]);
  });

  section.hidden = false;
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    counters.forEach(([element, stat]) => countUp(element, stat));
    observer.disconnect();
  }, { threshold: 0.4 });
  observer.observe(section);
};

const activityFirstDelayMs = 5_000;
const activityIntervalMs = 15_000;
const activityVisibleMs = 6_000;
const activityMaxPerVisit = 30;

// Avisos de atividade real (assinaturas e testes recentes, anônimos): da Edge Function quando houver
// VITE_ACTIVITY_URL, senão da lista cadastrada à mão. Sem eventos, nada aparece.
export const setupActivityToasts = async () => {
  const url = import.meta.env.VITE_ACTIVITY_URL;
  const toast = document.querySelector<HTMLElement>('[data-activity]');
  if (!toast) return;

  let events: ActivityEvent[] = manualEvents;
  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) events = parseActivity(await response.json());
    } catch {
      return;
    }
  }
  if (!events.length) return;

  const text = toast.querySelector<HTMLElement>('[data-activity-text]');
  const time = toast.querySelector<HTMLElement>('[data-activity-time]');
  const badge = toast.querySelector<HTMLElement>('[data-activity-badge]');
  const close = toast.querySelector<HTMLButtonElement>('[data-activity-close]');
  let shown = 0;
  let timer = 0;

  const hide = () => toast.classList.remove('activity--visible');
  const show = () => {
    const event = events[shown % events.length];
    if (text) text.textContent = describeActivity(event);
    if (time) time.textContent = activityTime(event, new Date());
    if (badge) badge.textContent = activityBadge(event);
    toast.dataset.tone = activityTone(event);
    toast.hidden = false;
    window.requestAnimationFrame(() => toast.classList.add('activity--visible'));
    window.setTimeout(hide, activityVisibleMs);
    shown += 1;
    if (shown < Math.min(activityMaxPerVisit, events.length)) timer = window.setTimeout(show, activityIntervalMs);
  };

  close?.addEventListener('click', () => {
    hide();
    window.clearTimeout(timer);
  });
  timer = window.setTimeout(show, activityFirstDelayMs);
};

setupMenu();
setupYear();
setupAnalytics();
void setupActivityToasts();
void setupSocialProof();
setupHeroVideo();
setupReveal();
setupScrollEffects();
setupPricing();
setupCalculator();
