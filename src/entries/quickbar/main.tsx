import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../shared/components/Icon';
import { openLibrary } from '../../shared/services/library-service';
import { getShortcutGroups, prepareShortcutMessage, registerShortcutUse, type ShortcutGroups, type ShortcutItem } from '../../shared/services/shortcut-service';
import './quickbar.scss';

type SendState = 'idle' | 'sending' | 'success' | 'error';

const emptyGroups: ShortcutGroups = { funnels: [], audios: [], images: [], texts: [], documents: [] };

const setFrameOpen = (isOpen: boolean): void => {
  window.parent.postMessage({ source: 'vozflow-quickbar', type: 'RESIZE_QUICKBAR', isOpen }, '*');
};

const getShortcutIcon = (shortcut: ShortcutItem): 'flow' | 'microphone' | 'image' | 'text' | 'document' => {
  if (shortcut.kind === 'funnels') return 'flow';
  if (shortcut.kind === 'audios') return 'microphone';
  if (shortcut.kind === 'images') return 'image';
  if (shortcut.kind === 'texts') return 'text';
  return 'document';
};

const getShortcutType = (shortcut: ShortcutItem): string => {
  if (shortcut.kind === 'funnels') return 'Funil';
  if (shortcut.kind === 'audios') return 'Áudio';
  if (shortcut.kind === 'images') return 'Imagem';
  if (shortcut.kind === 'texts') return 'Mensagem';
  return 'Documento';
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return 'Envio imediato';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min e ${remainder} seg`;
};

const formatEndTime = (seconds: number): string => new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(Date.now() + seconds * 1000));

export const QuickbarApp = (): ReactElement | null => {
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const [groups, setGroups] = useState<ShortcutGroups>(emptyGroups);
  const [selected, setSelected] = useState<ShortcutItem | null>(null);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [message, setMessage] = useState('');
  const [currentChat, setCurrentChat] = useState('Conversa aberta');
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openLibrary().then(async (nextDatabase) => {
      setDatabase(nextDatabase);
      setGroups(await getShortcutGroups(nextDatabase));
    }).catch(() => setMessage('Não foi possível abrir seus atalhos.'));
    setFrameOpen(false);
  }, []);

  useEffect(() => {
    if (!database) return undefined;
    const refreshShortcuts = (): void => { void getShortcutGroups(database).then(setGroups); };
    const interval = window.setInterval(refreshShortcuts, 5_000);
    window.addEventListener('focus', refreshShortcuts);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshShortcuts);
    };
  }, [database]);

  useEffect(() => {
    window.parent.postMessage({ source: 'vozflow-quickbar', type: 'SYNC_SHORTCUTS', groups }, '*');
  }, [groups]);

  useEffect(() => {
    const handlePageEvent = (event: MessageEvent): void => {
      if (event.source !== window.parent) return;
      if (event.data?.source === 'vozflow-host' && event.data.type === 'OPEN_SHORTCUT' && event.data.shortcut) {
        setSelected(event.data.shortcut as ShortcutItem);
        setSendState('idle');
        setMessage('');
        setIsNoticeOpen(false);
        setFrameOpen(true);
        window.parent.postMessage({ source: 'vozflow-quickbar', type: 'SEND_SHORTCUT', payload: { type: 'GET_ACTIVE_CHAT' } }, '*');
        return;
      }
      if (event.data?.source !== 'vozflow-page') return;
      const payload = event.data.payload as { type?: string; message?: string; chatName?: string } | undefined;
      if (payload?.type === 'ERROR') {
        setSendState('error');
        setMessage(payload.message || 'Não foi possível enviar.');
      }
      if (payload?.type === 'CHAT_CONTEXT' && payload.chatName) setCurrentChat(payload.chatName);
      if (payload?.type === 'SENT' || payload?.type === 'FUNNEL_STARTED') {
        setSendState('success');
        setMessage(payload.type === 'FUNNEL_STARTED' ? 'Funil iniciado.' : 'Mensagem enviada.');
      }
    };
    window.addEventListener('message', handlePageEvent);
    return () => window.removeEventListener('message', handlePageEvent);
  }, []);

  const close = (): void => {
    if (sendState === 'sending') return;
    setSelected(null);
    setSendState('idle');
    setMessage('');
    setFrameOpen(false);
  };

  useEffect(() => {
    if (!selected) return undefined;
    cancelButtonRef.current?.focus();
    const handleFocusTrap = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleFocusTrap);
    return () => window.removeEventListener('keydown', handleFocusTrap);
  }, [selected, isNoticeOpen]);

  useEffect(() => {
    if (!selected) return undefined;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selected, sendState]);

  useEffect(() => {
    if (sendState !== 'success') return undefined;
    const timeout = window.setTimeout(close, 1_200);
    return () => window.clearTimeout(timeout);
  }, [sendState]);

  const confirmSend = async (): Promise<void> => {
    if (!database || !selected || sendState === 'sending') return;
    setSendState('sending');
    setMessage('Preparando envio...');
    try {
      const payload = await prepareShortcutMessage(database, selected);
      window.parent.postMessage({ source: 'vozflow-quickbar', type: 'SEND_SHORTCUT', payload }, '*');
      await registerShortcutUse(database, selected);
      setMessage('Enviando para a conversa aberta...');
    } catch (error) {
      setSendState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível preparar o envio.');
    }
  };

  if (!selected) return null;

  const shortcutType = getShortcutType(selected);
  const durationSeconds = selected.durationSeconds || 0;
  const chatInitials = currentChat.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  return <div className="shortcut-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="shortcut-panel" role="dialog" aria-modal="true" aria-labelledby="shortcut-confirm-title" aria-describedby="shortcut-confirm-description">
      <header className="shortcut-panel__header">
        <div><span className="shortcut-panel__info"><Icon name="info" /></span><h2 id="shortcut-confirm-title">Confirmação de envio</h2></div>
        <button type="button" onClick={close} aria-label="Fechar confirmação" disabled={sendState === 'sending'}><Icon name="close" /></button>
      </header>
      <div className="shortcut-confirm">
        <p id="shortcut-confirm-description" className="shortcut-confirm__summary">Revise os dados antes de enviar.</p>
        <dl className="shortcut-details">
          <div className="shortcut-details__row"><dt><Icon name="user" />Destinatário:</dt><dd><span className="shortcut-details__avatar">{chatInitials || 'WA'}</span>{currentChat}</dd></div>
          <div className="shortcut-details__row"><dt><Icon name={getShortcutIcon(selected)} />{shortcutType}:</dt><dd><strong>{selected.name}</strong><small>{selected.detail}</small></dd></div>
          <div className="shortcut-details__row"><dt><Icon name="clock" />Duração:</dt><dd>{formatDuration(durationSeconds)}</dd></div>
          <div className="shortcut-details__row"><dt><Icon name="check" />Término:</dt><dd>{formatEndTime(durationSeconds)}</dd></div>
        </dl>
        <section className={`shortcut-guidance ${isNoticeOpen ? 'shortcut-guidance--open' : ''}`}>
          <button type="button" className="shortcut-guidance__toggle" aria-expanded={isNoticeOpen} aria-controls="shortcut-guidance-content" onClick={() => setIsNoticeOpen((value) => !value)}><Icon name="warning" /><strong>Importante saber</strong><Icon name="chevronDown" /></button>
          <div id="shortcut-guidance-content" className="shortcut-guidance__content" hidden={!isNoticeOpen}>
            <div className="shortcut-guidance__recommended"><p><Icon name="check" />Confirme o destinatário e o conteúdo selecionado.</p><p><Icon name="check" />Mantenha esta conversa aberta durante o envio.</p></div>
            <div className="shortcut-guidance__warning"><strong>Não recomendado</strong><p><Icon name="warning" />Enviar conteúdo sem a autorização do contato.</p>{selected.kind === 'funnels' && <p><Icon name="warning" />Sair do WhatsApp Web durante as etapas do funil.</p>}</div>
          </div>
        </section>
        {message && <div className={`shortcut-confirm__status shortcut-confirm__status--${sendState}`} role="status" aria-live="polite">{sendState === 'success' && <Icon name="check" />}{message}</div>}
        <div className="shortcut-confirm__actions">
          <button ref={cancelButtonRef} type="button" className="shortcut-button" disabled={sendState === 'sending'} onClick={close}>Cancelar</button>
          <button type="button" className="shortcut-button shortcut-button--primary" disabled={sendState === 'sending' || sendState === 'success'} onClick={() => void confirmSend()}>{sendState === 'sending' ? 'Enviando...' : `Enviar ${shortcutType.toLowerCase()}`}</button>
        </div>
      </div>
    </section>
  </div>;
};

createRoot(document.getElementById('root')!).render(<QuickbarApp />);
