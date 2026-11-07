import './content.scss';
import type {
  ActiveChatChangedMessage,
  AutomationRuntimeMessage,
  ExtensionMessage,
  IncomingMessage,
  ScheduledDeliveryPreparation,
  ScheduledDeliveryResult,
} from '../shared/types';
import { getLicenseSnapshot, hasSendAccess } from '../shared/services/license-service';
import { licenseBlockedMessage, licenseCopy } from '../shared/utils/license-copy';

const channel = 'vozflow-extension';
const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
const shellId = 'vozflow-shell';
const licensedSendTypes = new Set(['SEND_AUDIO', 'SEND_IMAGE', 'SEND_TEXT', 'SEND_DOCUMENT', 'START_FUNNEL']);

type QuickShortcut = {
  id: string;
  kind: 'funnels' | 'audios' | 'images' | 'texts' | 'documents';
  name: string;
  detail: string;
  durationSeconds: number;
  usageCount: number;
  lastUsedAt: number;
  createdAt: number;
};

type ShortcutKind = QuickShortcut['kind'];
type ShortcutFilter = 'all' | ShortcutKind;

const shortcutKindPriority: Record<ShortcutKind, number> = {
  funnels: 0,
  audios: 1,
  images: 2,
  texts: 3,
  documents: 4,
};

const shortcutFilterOptions: Array<{ id: ShortcutFilter; label: string; color: string }> = [
  { id: 'all', label: 'Todos', color: '#a78bfa' },
  { id: 'funnels', label: 'Funis', color: '#facc15' },
  { id: 'audios', label: 'Áudios', color: '#38bdf8' },
  { id: 'images', label: 'Imagens', color: '#34d399' },
  { id: 'texts', label: 'Mensagens', color: '#d946ef' },
  { id: 'documents', label: 'Documentos', color: '#f472b6' },
];

const installShell = (): void => {
  if (document.getElementById(shellId)) return;

  const shell = document.createElement('div');
  shell.id = shellId;
  shell.className = 'vp-shell vp-shell--closed';

  const launcher = document.createElement('button');
  launcher.className = 'vp-shell__fab';
  launcher.type = 'button';
  launcher.ariaLabel = 'Abrir VozFlow';
  launcher.title = 'Abrir VozFlow';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 14.5a4.5 4.5 0 0 0 4.5-4.5V5a4.5 4.5 0 1 0-9 0v5a4.5 4.5 0 0 0 4.5 4.5Zm7-4.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.08A7 7 0 0 0 19 10Z"/>
    </svg>`;

  const panel = document.createElement('iframe');
  panel.className = 'vp-shell__panel';
  panel.title = 'VozFlow';
  panel.allow = 'autoplay';
  panel.hidden = true;

  const quickbar = document.createElement('iframe');
  quickbar.className = 'vp-shell__quickbar';
  quickbar.title = 'Atalhos VozFlow';
  quickbar.allow = 'autoplay';
  quickbar.src = chrome.runtime.getURL('src/entries/quickbar/index.html');
  quickbar.dataset.open = 'false';

  const shortcutDock = document.createElement('div');
  shortcutDock.className = 'vp-shortcuts-dock';
  shortcutDock.hidden = true;

  const filterWrap = document.createElement('div');
  filterWrap.className = 'vp-shortcuts-filter';

  const filterButton = document.createElement('button');
  filterButton.className = 'vp-shortcuts-filter__trigger';
  filterButton.type = 'button';
  filterButton.ariaLabel = 'Filtrar atalhos por tipo';
  filterButton.title = 'Filtrar atalhos';
  filterButton.setAttribute('aria-expanded', 'false');
  filterButton.setAttribute('aria-controls', 'vp-shortcuts-filter-menu');
  filterButton.innerHTML = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M3.9 54.9C10.5 40.9 24.5 32 40 32h432c15.5 0 29.5 8.9 36.1 22.9s4.6 30.5-5.2 42.5L320 320.9V448c0 12.1-6.8 23.2-17.7 28.6l-64 32c-9.9 5-21.7 4.4-31-1.4S192 491.1 192 480V320.9L9 97.3C-.7 85.4-2.8 68.8 3.9 54.9z"/></svg>';

  const filterMenu = document.createElement('div');
  filterMenu.id = 'vp-shortcuts-filter-menu';
  filterMenu.className = 'vp-shortcuts-filter__menu';
  filterMenu.role = 'menu';
  filterMenu.hidden = true;

  const shortcutRow = document.createElement('div');
  shortcutRow.className = 'vp-shortcuts-row';
  shortcutRow.ariaLabel = 'Atalhos mais usados do VozFlow';

  filterWrap.append(filterButton, filterMenu);
  shortcutDock.append(filterWrap, shortcutRow);

  let shortcutGroups: Record<ShortcutKind, QuickShortcut[]> = { funnels: [], audios: [], images: [], texts: [], documents: [] };
  let activeFilter: ShortcutFilter = 'all';
  let attachedFooter: HTMLElement | null = null;

  const shortcutIconPaths: Record<QuickShortcut['kind'], { path: string; viewBox: string }> = {
    funnels: { viewBox: '0 0 576 512', path: 'M0 80C0 53.5 21.5 32 48 32h96c26.5 0 48 21.5 48 48v16h192V80c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48h-96c-26.5 0-48-21.5-48-48v-16H192v16c0 1.7-.1 3.4-.3 5L272 288h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48h-96c-26.5 0-48-21.5-48-48v-96c0-1.7.1-3.4.3-5L144 224H48c-26.5 0-48-21.5-48-48V80z' },
    audios: { viewBox: '0 0 384 512', path: 'M192 0C139 0 96 43 96 96v160c0 53 43 96 96 96s96-43 96-96V96c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24v40c0 89.1 66.2 162.7 152 174.4V464h-48c-13.3 0-24 10.7-24 24s10.7 24 24 24h144c13.3 0 24-10.7 24-24s-10.7-24-24-24h-48v-33.6c85.8-11.7 152-85.3 152-174.4v-40c0-13.3-10.7-24-24-24s-24 10.7-24 24v40c0 70.7-57.3 128-128 128S64 326.7 64 256v-40z' },
    images: { viewBox: '0 0 512 512', path: 'M64 64C28.7 64 0 92.7 0 128v256c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm80 96a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm40 224H64l82.4-109.8c6.4-8.5 19.2-8.5 25.6 0l42 56 58.3-81.6c6.4-9 19.8-9.2 26.5-.4L448 384H184z' },
    texts: { viewBox: '0 0 512 512', path: 'M256 448c141.4 0 256-93.1 256-208S397.4 32 256 32 0 125.1 0 240c0 45.1 17.7 86.8 47.7 120.9-1.9 24.5-11.4 46.3-21.4 62.9C17 439.3 7 450 4.6 452.8c-4.6 4.6-5.9 11.4-3.4 17.4 2.5 6 8.3 9.9 14.8 9.9 51.5 0 104-28.2 135.9-49.9C183.7 441.7 218.9 448 256 448z' },
    documents: { viewBox: '0 0 384 512', path: 'M64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zm192 0v128h128L256 0zM96 256c0-8.8 7.2-16 16-16h160c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16zm0 64c0-8.8 7.2-16 16-16h160c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16z' },
  };

  const getVisibleShortcuts = (): QuickShortcut[] => {
    if (activeFilter !== 'all') return shortcutGroups[activeFilter].slice(0, 3);
    return Object.values(shortcutGroups).flat().sort((first, second) => {
      const kindDifference = shortcutKindPriority[first.kind] - shortcutKindPriority[second.kind];
      if (kindDifference !== 0) return kindDifference;
      const usageDifference = second.usageCount - first.usageCount;
      return usageDifference || second.lastUsedAt - first.lastUsedAt || second.createdAt - first.createdAt;
    }).slice(0, 3);
  };

  const renderFilterMenu = (): void => {
    const items = shortcutFilterOptions.map((option) => {
      const button = document.createElement('button');
      button.className = 'vp-shortcuts-filter__option';
      button.type = 'button';
      button.role = 'menuitemradio';
      button.setAttribute('aria-checked', String(activeFilter === option.id));
      button.dataset.active = String(activeFilter === option.id);

      const marker = document.createElement('span');
      marker.className = 'vp-shortcuts-filter__marker';
      marker.style.setProperty('--filter-color', option.color);
      const label = document.createElement('span');
      label.textContent = option.label;
      const count = document.createElement('small');
      count.textContent = String(option.id === 'all' ? Object.values(shortcutGroups).flat().length : shortcutGroups[option.id].length);
      button.append(marker, label, count);
      button.addEventListener('click', () => {
        activeFilter = option.id;
        filterMenu.hidden = true;
        filterButton.setAttribute('aria-expanded', 'false');
        filterButton.title = `Filtro: ${option.label}`;
        renderFilterMenu();
        renderShortcutRow();
        positionQuickbar();
      });
      return button;
    });
    filterMenu.replaceChildren(...items);
  };

  const renderShortcutRow = (): void => {
    const shortcuts = getVisibleShortcuts();
    const buttons = shortcuts.map((shortcut) => {
      const button = document.createElement('button');
      button.className = `vp-shortcuts-row__item vp-shortcuts-row__item--${shortcut.kind}`;
      button.type = 'button';
      button.ariaLabel = `Confirmar envio de ${shortcut.name}`;
      button.title = shortcut.name;

      const icon = document.createElement('span');
      icon.className = 'vp-shortcuts-row__icon';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const iconData = shortcutIconPaths[shortcut.kind];
      svg.setAttribute('viewBox', iconData.viewBox);
      svg.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', iconData.path);
      path.setAttribute('fill', 'currentColor');
      svg.append(path);
      icon.append(svg);

      const label = document.createElement('span');
      label.className = 'vp-shortcuts-row__label';
      const name = document.createElement('strong');
      name.textContent = shortcut.name;
      label.append(name);

      button.append(icon, label);
      button.addEventListener('click', () => {
        quickbar.contentWindow?.postMessage({ source: 'vozflow-host', type: 'OPEN_SHORTCUT', shortcut }, extensionOrigin);
      });
      return button;
    });
    if (buttons.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'vp-shortcuts-row__empty';
      empty.textContent = 'Nenhum atalho deste tipo';
      shortcutRow.replaceChildren(empty);
      return;
    }
    shortcutRow.replaceChildren(...buttons);
  };

  filterButton.addEventListener('click', () => {
    const willOpen = filterMenu.hidden;
    filterMenu.hidden = !willOpen;
    filterButton.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) filterMenu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });

  const isVisibleComposerElement = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return rect.width > 120
      && rect.height > 18
      && rect.bottom > window.innerHeight * .6
      && rect.top < window.innerHeight
      && styles.display !== 'none'
      && styles.visibility !== 'hidden';
  };

  const findComposer = (): HTMLElement | undefined => {
    const selectors = [
      'footer [contenteditable="true"]',
      '[contenteditable="true"][aria-placeholder]',
      '[contenteditable="true"][data-tab]',
      '[contenteditable="true"]',
    ];
    const candidates = selectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)]);
    const uniqueCandidates = [...new Set(candidates)].filter(isVisibleComposerElement);
    uniqueCandidates.sort((first, second) => {
      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      return secondRect.bottom - firstRect.bottom || secondRect.width - firstRect.width;
    });
    return uniqueCandidates[0]
      || [...document.querySelectorAll<HTMLElement>('footer')].find(isVisibleComposerElement);
  };

  const positionQuickbar = (): void => {
    if (quickbar.dataset.open === 'true') {
      quickbar.style.width = `${window.innerWidth}px`;
      quickbar.style.height = `${window.innerHeight}px`;
      quickbar.style.left = '0';
      quickbar.style.bottom = '0';
      quickbar.style.pointerEvents = 'auto';
      quickbar.hidden = false;
      shortcutDock.hidden = true;
      return;
    }

    const composer = findComposer();
    if (!composer) {
      quickbar.hidden = true;
      shortcutDock.hidden = true;
      attachedFooter?.classList.remove('vp-footer-with-shortcuts');
      attachedFooter = null;
      shell.classList.remove('vp-shell--has-shortcuts');
      return;
    }
    const rect = composer.getBoundingClientRect();
    quickbar.style.width = '1px';
    quickbar.style.height = '1px';
    quickbar.style.left = '0';
    quickbar.style.bottom = '0';
    quickbar.style.pointerEvents = 'none';
    quickbar.hidden = false;

    const hasShortcuts = Object.values(shortcutGroups).some((items) => items.length > 0);
    shell.classList.toggle('vp-shell--has-shortcuts', hasShortcuts);
    if (!hasShortcuts) {
      attachedFooter?.classList.remove('vp-footer-with-shortcuts');
      attachedFooter = null;
      shortcutDock.hidden = true;
      return;
    }
    const footer = composer.closest<HTMLElement>('footer');
    if (footer) {
      if (attachedFooter && attachedFooter !== footer) attachedFooter.classList.remove('vp-footer-with-shortcuts');
      attachedFooter = footer;
      attachedFooter.classList.add('vp-footer-with-shortcuts');
      shortcutDock.classList.remove('vp-shortcuts-dock--floating');
      if (shortcutDock.parentElement !== footer) footer.append(shortcutDock);
      const footerRect = footer.getBoundingClientRect();
      shortcutDock.style.left = '0';
      shortcutDock.style.width = `${footerRect.width}px`;
      shortcutDock.style.top = '';
    } else {
      attachedFooter?.classList.remove('vp-footer-with-shortcuts');
      attachedFooter = null;
      shortcutDock.classList.add('vp-shortcuts-dock--floating');
      if (shortcutDock.parentElement !== document.documentElement) document.documentElement.append(shortcutDock);
      const dockLeft = Math.max(8, rect.left);
      shortcutDock.style.left = `${dockLeft}px`;
      shortcutDock.style.top = `${Math.min(window.innerHeight - 66, rect.bottom + 7)}px`;
      shortcutDock.style.width = `${Math.max(240, Math.min(rect.width, window.innerWidth - dockLeft - 8))}px`;
    }
    shortcutDock.hidden = false;
  };

  let positionFrame: number | undefined;
  const schedulePosition = (): void => {
    if (positionFrame) return;
    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = undefined;
      positionQuickbar();
    });
  };

  const composerObserver = new MutationObserver(schedulePosition);
  composerObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedulePosition);
  window.setInterval(schedulePosition, 1_500);
  schedulePosition();

  let hidePanelTimer: number | undefined;

  const togglePanel = (force?: boolean): void => {
    const shouldOpen = force ?? shell.classList.contains('vp-shell--closed');

    if (hidePanelTimer) window.clearTimeout(hidePanelTimer);

    if (shouldOpen) {
      if (!panel.dataset.loaded) {
        panel.src = chrome.runtime.getURL('src/entries/sidepanel/index.html');
        panel.dataset.loaded = 'true';
      }

      panel.hidden = false;
      window.requestAnimationFrame(() => shell.classList.remove('vp-shell--closed'));
    } else {
      shell.classList.add('vp-shell--closed');
      hidePanelTimer = window.setTimeout(() => {
        if (shell.classList.contains('vp-shell--closed')) panel.hidden = true;
      }, 240);
    }

    launcher.setAttribute('aria-expanded', String(shouldOpen));
  };

  launcher.addEventListener('click', () => togglePanel(true));
  shell.append(launcher, panel, quickbar);
  document.documentElement.appendChild(shell);

  document.addEventListener('pointerdown', (event) => {
    if (filterMenu.hidden || filterWrap.contains(event.target as Node)) return;
    filterMenu.hidden = true;
    filterButton.setAttribute('aria-expanded', 'false');
  });

  filterWrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || filterMenu.hidden) return;
    filterMenu.hidden = true;
    filterButton.setAttribute('aria-expanded', 'false');
    filterButton.focus();
  });

  const pageMessageTypes = new Set<ExtensionMessage['type']>([
    'GET_ACTIVE_CHAT',
    'SEND_AUDIO',
    'SEND_IMAGE',
    'SEND_TEXT',
    'SEND_DOCUMENT',
    'START_FUNNEL',
    'CANCEL_FUNNEL',
    'EXECUTE_SCHEDULED_STEP',
    'RUN_TRIGGER',
  ]);

  let ownPhone: string | null = null;

  // Envios manuais só seguem para o WhatsApp com passe válido para o número conectado.
  const forwardToPage = async (message: { type?: string; jobId?: string }): Promise<void> => {
    if (message.type && licensedSendTypes.has(message.type)) {
      const license = await getLicenseSnapshot();
      if (!(await hasSendAccess(license, ownPhone))) {
        const state = licenseCopy[license.state].tone === 'ok' ? 'verificando' : license.state;
        if (message.type === 'START_FUNNEL' && message.jobId) {
          window.postMessage({ channel, type: 'FUNNEL_ERROR', jobId: message.jobId }, window.location.origin);
        }
        window.postMessage({ channel, type: 'ERROR', message: licenseBlockedMessage(state) }, window.location.origin);
        togglePanel(true);
        return;
      }
    }
    window.postMessage({ channel, ...message }, window.location.origin);
  };

  chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message.type === 'VOZFLOW_OPEN') togglePanel(true);
    if (message.type === 'VOZFLOW_TOGGLE') togglePanel();
    if (message.type && pageMessageTypes.has(message.type as ExtensionMessage['type'])) {
      void forwardToPage(message);
    }
    sendResponse({ ok: true });
  });

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source === quickbar.contentWindow && event.origin === extensionOrigin) {
      if (event.data?.source !== 'vozflow-quickbar') return;
      if (event.data.type === 'RESIZE_QUICKBAR') {
        quickbar.dataset.open = String(Boolean(event.data.isOpen));
        positionQuickbar();
        return;
      }
      if (event.data.type === 'SYNC_SHORTCUTS' && event.data.groups) {
        shortcutGroups = event.data.groups as Record<ShortcutKind, QuickShortcut[]>;
        renderFilterMenu();
        renderShortcutRow();
        positionQuickbar();
        return;
      }
      if (event.data.type === 'SEND_SHORTCUT' && event.data.payload) {
        void forwardToPage(event.data.payload);
      }
      return;
    }

    if (event.source === panel.contentWindow && event.origin === extensionOrigin) {
      if (event.data?.source !== 'vozflow-panel') return;
      if (event.data.type === 'CLOSE_PANEL') {
        togglePanel(false);
        return;
      }
      void forwardToPage(event.data.payload);
      return;
    }

    if (event.source === window && event.data?.channel === channel) {
      if (event.data.type === 'OWN_ACCOUNT') {
        const phone = typeof event.data.phone === 'string' ? event.data.phone : '';
        if (phone === (ownPhone ?? '')) return;
        ownPhone = phone || null;
        if (ownPhone) void chrome.runtime.sendMessage({ type: 'LICENSE_ACCOUNT_DETECTED', phone: ownPhone }).catch(() => undefined);
        return;
      }
      // Mensagens recebidas e resultados de gatilhos vão só para o background, nunca para os painéis.
      if (event.data.type === 'INCOMING_MESSAGE') {
        const message: IncomingMessage = {
          chatId: String(event.data.chatId || ''),
          chatName: String(event.data.chatName || ''),
          phone: String(event.data.phone || '').replace(/\D/g, ''),
          text: String(event.data.text || ''),
          isGroup: event.data.isGroup === true,
          timestamp: Number(event.data.timestamp) || Date.now(),
        };
        if (message.chatId) void chrome.runtime.sendMessage({ type: 'AUTOMATION_INCOMING_MESSAGE', message } satisfies AutomationRuntimeMessage).catch(() => undefined);
        return;
      }
      if (event.data.type === 'TRIGGER_RESULT') {
        void chrome.runtime.sendMessage({
          type: 'AUTOMATION_TRIGGER_RESULT',
          firingId: String(event.data.firingId || ''),
          ok: event.data.ok === true,
          error: typeof event.data.error === 'string' ? event.data.error : undefined,
        } satisfies AutomationRuntimeMessage).catch(() => undefined);
        return;
      }
      if (event.data.type === 'SCHEDULED_DELIVERY_PREPARE') {
        const requestId = String(event.data.requestId || '');
        const preparation: ScheduledDeliveryPreparation = {
          type: 'PREPARE_SCHEDULED_DELIVERY',
          deliveryId: String(event.data.deliveryId || ''),
          executionId: String(event.data.executionId || ''),
          currentStep: Number(event.data.currentStep),
          messageId: String(event.data.messageId || ''),
          previousMessageId: typeof event.data.previousMessageId === 'string'
            ? event.data.previousMessageId
            : undefined,
          resolvedChatId: String(event.data.resolvedChatId || ''),
        };
        void chrome.runtime.sendMessage(preparation).then((response: { ok?: boolean; error?: string } | undefined) => {
          window.postMessage({
            channel,
            type: 'SCHEDULED_DELIVERY_PREPARED',
            requestId,
            ok: Boolean(response?.ok),
            error: response?.error,
          }, window.location.origin);
        }).catch((error: unknown) => {
          window.postMessage({
            channel,
            type: 'SCHEDULED_DELIVERY_PREPARED',
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Não foi possível preparar o envio agendado.',
          }, window.location.origin);
        });
        return;
      }
      if (event.data.type === 'SCHEDULED_DELIVERY_ACKNOWLEDGED') {
        void chrome.runtime.sendMessage({
          type: 'SCHEDULE_DELIVERY_ACKNOWLEDGED',
          deliveryId: String(event.data.deliveryId || ''),
          executionId: String(event.data.executionId || ''),
        });
        return;
      }
      if (event.data.type === 'CHAT_CONTEXT' && event.data.chatName) {
        const activeChat: ActiveChatChangedMessage = {
          type: 'ACTIVE_CHAT_CHANGED',
          chatId: String(event.data.chatId || ''),
          chatName: String(event.data.chatName),
          phone: String(event.data.phone || '').replace(/\D/g, ''),
          ...(typeof event.data.lastInboundAt === 'number' ? { lastInboundAt: event.data.lastInboundAt } : {}),
        };
        void chrome.runtime.sendMessage(activeChat);
      }
      if (event.data.type === 'SCHEDULED_DELIVERY_SENT' || event.data.type === 'SCHEDULED_DELIVERY_ERROR') {
        const result: ScheduledDeliveryResult = {
          type: 'SCHEDULE_DELIVERY_RESULT',
          deliveryId: String(event.data.deliveryId || ''),
          executionId: String(event.data.executionId || ''),
          ok: event.data.type === 'SCHEDULED_DELIVERY_SENT',
          error: typeof event.data.message === 'string' ? event.data.message : undefined,
          retryable: event.data.retryable === true,
          resolvedChatId: typeof event.data.resolvedChatId === 'string' ? event.data.resolvedChatId : undefined,
        };
        void chrome.runtime.sendMessage(result);
      }
      panel.contentWindow?.postMessage({ source: 'vozflow-page', payload: event.data }, extensionOrigin);
      quickbar.contentWindow?.postMessage({ source: 'vozflow-page', payload: event.data }, extensionOrigin);
    }
  });

  window.postMessage({ channel, type: 'GET_OWN_ACCOUNT' }, window.location.origin);
};

installShell();
