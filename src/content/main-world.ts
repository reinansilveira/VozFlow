import {
  extractWhatsAppChatId,
  findChatByExactName,
  getChatPhone,
  getWhatsAppChatId,
  getWhatsAppChatName,
  normalizeChatName,
  type WhatsAppChat,
} from './active-chat';
import { findLastInboundAt, parseIncomingMessage, type WhatsAppIncomingMessage } from './incoming-message';
import { getErrorMessage } from './send-result';
import { sendAudio, sendDocument, sendImage, sendMessageStep } from './wpp-sender';
import { executeScheduledStep } from './scheduled-executor';
import { getOwnPhone, isWppOperational } from './wpp-session';
import type { WhatsAppApi } from './wpp-api';
import { deserializeScheduleStep, type SerializedScheduleStep } from '../shared/utils/message-transport';
import { isTransientScheduleError } from '../shared/utils/schedule-retry';
import type { ScheduleStep } from '../shared/types';

type RunnableStep = Pick<ScheduleStep, 'type' | 'name' | 'fileName' | 'text' | 'mimeType' | 'bytes'> & {
  delayMs?: number;
};

declare global {
  interface Window {
    WPP?: WhatsAppApi;
    __vozFlowInstalled?: boolean;
  }
}

export {};

if (!window.__vozFlowInstalled) {
  window.__vozFlowInstalled = true;
  const channel = 'vozflow-extension';
  const jobs = new Map<string, { cancelled: boolean; chatId: string }>();
  const pendingPreparations = new Map<string, {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: number;
  }>();

  const notify = (type: string, detail: Record<string, unknown> = {}): void => {
    window.postMessage({ channel, type, ...detail }, window.location.origin);
  };

  const persistPreparedDelivery = (
    deliveryId: string,
    executionId: string,
    currentStep: number,
    messageId: string,
    resolvedChatId: string,
    previousMessageId?: string,
  ): Promise<void> => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      pendingPreparations.delete(requestId);
      reject(new Error('A fila não confirmou a preparação da mensagem. Tentaremos novamente.'));
    }, 10_000);
    pendingPreparations.set(requestId, { resolve, reject, timeout });
    notify('SCHEDULED_DELIVERY_PREPARE', {
      requestId,
      deliveryId,
      executionId,
      currentStep,
      messageId,
      previousMessageId,
      resolvedChatId,
    });
  });

  const waitForWpp = (): Promise<void> => new Promise((resolve, reject) => {
    if (!window.WPP?.loader) return reject(new Error('O módulo do WhatsApp não carregou. Recarregue a página.'));
    if (window.WPP.isReady) return resolve();
    try {
      if (!window.WPP.isInjected) window.WPP.loader.injectLoader();
      const timeout = window.setTimeout(() => reject(new Error('O WhatsApp ainda está carregando.')), 30_000);
      window.WPP.loader.onReady(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });

  const waitForWppOperational = async (): Promise<void> => {
    if (isWppOperational(window.WPP)) return;

    let fullReadyNotified = false;
    window.WPP?.loader.onFullReady?.(() => { fullReadyNotified = true; });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (isWppOperational(window.WPP)) return;
      await sleep(fullReadyNotified ? 100 : 300);
    }
    throw new Error('O WhatsApp não terminou de carregar ou está sem conexão. A mensagem será tentada novamente.');
  };

  const getVisibleElementText = (element: Element | null): string => {
    if (!(element instanceof HTMLElement)) return '';
    const rectangle = element.getBoundingClientRect();
    if (rectangle.width === 0 || rectangle.height === 0) return '';
    return (element.getAttribute('title') || element.textContent || '').trim();
  };

  const getRenderedChatName = (): string => {
    const main = document.querySelector('#main');
    if (!main) return '';

    const selectors = [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [dir="auto"]',
    ];
    for (const selector of selectors) {
      const name = getVisibleElementText(main.querySelector(selector));
      if (name) return name;
    }
    return '';
  };

  const getRenderedChatId = (): string => {
    const main = document.querySelector('#main');
    if (!main) return '';

    const directAttributes = ['data-chat-id', 'data-jid'];
    for (const attribute of directAttributes) {
      for (const element of main.querySelectorAll(`[${attribute}]`)) {
        const chatId = extractWhatsAppChatId(element.getAttribute(attribute) || '');
        if (chatId) return chatId;
      }
    }

    const messageElements = [...main.querySelectorAll('[data-id]')].reverse();
    for (const element of messageElements) {
      const chatId = extractWhatsAppChatId(element.getAttribute('data-id') || '');
      if (chatId) return chatId;
    }
    return '';
  };

  const getActiveChat = async (): Promise<{ id: string; name: string }> => {
    const visibleName = getRenderedChatName();
    let activeChat: WhatsAppChat | undefined;
    try {
      activeChat = window.WPP?.chat.getActiveChat();
    } catch {
      activeChat = undefined;
    }
    const activeChatId = getWhatsAppChatId(activeChat);
    const activeChatName = getWhatsAppChatName(activeChat);
    const activeChatMatchesVisible = !visibleName
      || !activeChatName
      || normalizeChatName(activeChatName) === normalizeChatName(visibleName);
    if (activeChatId && activeChatMatchesVisible) {
      return { id: activeChatId, name: activeChatName || visibleName || 'Conversa' };
    }

    const renderedChatId = getRenderedChatId();
    if (renderedChatId) {
      let renderedChat: WhatsAppChat | undefined;
      try {
        renderedChat = window.WPP?.chat.get?.(renderedChatId);
      } catch {
        renderedChat = undefined;
      }
      return { id: renderedChatId, name: getWhatsAppChatName(renderedChat) || visibleName || 'Conversa' };
    }

    if (visibleName && window.WPP?.chat.list) {
      try {
        const matchedChat = findChatByExactName(await window.WPP.chat.list(), visibleName);
        const matchedChatId = getWhatsAppChatId(matchedChat);
        if (matchedChatId) return { id: matchedChatId, name: getWhatsAppChatName(matchedChat) || visibleName };
      } catch {
        // A conversa visível continua sendo a fonte de verdade; falhas da lista não interrompem outros envios.
      }
    }

    throw new Error('Abra uma conversa antes de continuar.');
  };

  const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const runFunnel = async (jobId: string, chat: { id: string; name: string }, steps: RunnableStep[]): Promise<{ ok: boolean; error?: string }> => {
    const job = { cancelled: false, chatId: chat.id };
    jobs.set(jobId, job);

    try {
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const delayMs = Math.max(0, Math.min(Number(step.delayMs) || 0, 3_600_000));
        if (job.cancelled) throw new Error('Funil cancelado.');

        if (delayMs > 0) {
          const isAudio = step.type === 'audio';
          await (isAudio ? window.WPP?.chat.markIsRecording(chat.id, delayMs) : window.WPP?.chat.markIsComposing(chat.id, delayMs));
          const endAt = Date.now() + delayMs;
          while (Date.now() < endAt) {
            if (job.cancelled) throw new Error('Funil cancelado.');
            notify('FUNNEL_PROGRESS', { jobId, chatName: chat.name, step: index + 1, total: steps.length, remainingSeconds: Math.ceil((endAt - Date.now()) / 1000), indicator: isAudio ? 'recording' : 'typing' });
            await sleep(Math.min(1_000, Math.max(0, endAt - Date.now())));
          }
        }

        await window.WPP?.chat.markIsPaused(chat.id).catch(() => undefined);
        await sendMessageStep(window.WPP, chat.id, step);
        notify('FUNNEL_STEP_SENT', { jobId, chatName: chat.name, step: index + 1, total: steps.length });
      }
      notify('FUNNEL_DONE', { jobId, chatName: chat.name });
      return { ok: true };
    } catch (error) {
      await window.WPP?.chat.markIsPaused(chat.id).catch(() => undefined);
      const message = getErrorMessage(error, 'Funil interrompido.');
      notify('FUNNEL_ERROR', { jobId, chatName: chat.name, message });
      return { ok: false, error: message };
    } finally {
      jobs.delete(jobId);
    }
  };

  // Gatilhos e remarketing: repassa só mensagens novas recebidas; o background decide o que fazer.
  const handleNewMessage = async (payload: unknown): Promise<void> => {
    const parsed = parseIncomingMessage(payload as WhatsAppIncomingMessage, Date.now());
    if (!parsed) return;
    let chatName = '';
    try {
      chatName = getWhatsAppChatName(window.WPP?.chat.get?.(parsed.chatId));
    } catch {
      chatName = '';
    }
    const phone = parsed.isGroup ? '' : await getChatPhone(parsed.chatId, window.WPP?.contact);
    notify('INCOMING_MESSAGE', {
      chatId: parsed.chatId,
      chatName: chatName || parsed.senderName || phone || 'Contato',
      phone,
      text: parsed.text,
      isGroup: parsed.isGroup,
      timestamp: parsed.timestamp,
    });
  };

  let isListeningMessages = false;
  const listenIncomingMessages = (): void => {
    if (isListeningMessages || !window.WPP?.isReady || !window.WPP.on) return;
    isListeningMessages = true;
    window.WPP.on('chat.new_message', (payload) => void handleNewMessage(payload).catch(() => undefined));
  };
  const incomingListenerTimer = window.setInterval(() => {
    listenIncomingMessages();
    if (isListeningMessages) window.clearInterval(incomingListenerTimer);
  }, 3_000);

  const getLastInboundAt = async (chatId: string): Promise<number | undefined> => {
    if (!chatId || chatId.endsWith('@g.us')) return undefined;
    try {
      return findLastInboundAt(await window.WPP?.chat.getMessages?.(chatId, { count: 50 }) ?? []);
    } catch {
      return undefined;
    }
  };

  // Informa ao content script o número da conta conectada, usado pela licença.
  let reportedPhone: string | null = null;
  const reportOwnAccount = (force = false): void => {
    const phone = getOwnPhone(window.WPP);
    if (!force && phone === reportedPhone) return;
    reportedPhone = phone;
    notify('OWN_ACCOUNT', { phone });
  };
  window.setInterval(() => reportOwnAccount(), 5_000);

  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source !== window || event.data?.channel !== channel) return;
    if (event.data.type === 'GET_OWN_ACCOUNT') {
      reportOwnAccount(true);
      return;
    }
    if (event.data.type === 'SCHEDULED_DELIVERY_PREPARED') {
      const requestId = String(event.data.requestId || '');
      const pending = pendingPreparations.get(requestId);
      if (!pending) return;
      pendingPreparations.delete(requestId);
      window.clearTimeout(pending.timeout);
      if (event.data.ok) pending.resolve();
      else pending.reject(new Error(getErrorMessage(event.data.error, 'Não foi possível preparar o envio agendado.')));
      return;
    }
    const data = event.data as { type: string; jobId?: string; audio?: { name?: string; bytes: ArrayBuffer }; image?: { name?: string; mimeType?: string; bytes: ArrayBuffer }; document?: { name?: string; fileName?: string; mimeType?: string; bytes: ArrayBuffer }; text?: { name?: string; text: string }; steps?: RunnableStep[] };
    if (data.type === 'CANCEL_FUNNEL') {
      const job = data.jobId ? jobs.get(data.jobId) : undefined;
      if (job) job.cancelled = true;
      return;
    }
    if (data.type === 'RUN_TRIGGER') {
      const triggerData = event.data as { firingId?: string; chatId?: string; chatName?: string; steps?: Array<SerializedScheduleStep & { delayMs?: number }> };
      const firingId = String(triggerData.firingId || '');
      try {
        if (!firingId || !triggerData.chatId || !triggerData.steps?.length) throw new Error('O gatilho chegou incompleto.');
        await waitForWpp();
        await waitForWppOperational();
        const steps = triggerData.steps.map((step) => ({ ...deserializeScheduleStep(step), delayMs: step.delayMs }));
        const result = await runFunnel(`trigger-${firingId}`, { id: triggerData.chatId, name: triggerData.chatName || 'Contato' }, steps);
        notify('TRIGGER_RESULT', { firingId, ok: result.ok, error: result.error });
      } catch (error) {
        notify('TRIGGER_RESULT', { firingId, ok: false, error: getErrorMessage(error, 'Não foi possível executar o gatilho.') });
      }
      return;
    }
    if (!['GET_ACTIVE_CHAT', 'SEND_AUDIO', 'SEND_IMAGE', 'SEND_TEXT', 'SEND_DOCUMENT', 'START_FUNNEL', 'EXECUTE_SCHEDULED_STEP'].includes(data.type)) return;

    try {
      if (data.type === 'EXECUTE_SCHEDULED_STEP') {
        const scheduledData = data as typeof data & {
          deliveryId?: string;
          executionId?: string;
          chatId?: string;
          chatName?: string;
          currentStep?: number;
          messageId?: string;
          step?: SerializedScheduleStep;
        };
        let resolvedChatId = '';
        try {
          if (!scheduledData.deliveryId || !scheduledData.executionId || !scheduledData.chatId || !scheduledData.step || !Number.isInteger(scheduledData.currentStep)) {
            throw new Error('A entrega agendada está incompleta.');
          }
          notify('SCHEDULED_DELIVERY_ACKNOWLEDGED', {
            deliveryId: scheduledData.deliveryId,
            executionId: scheduledData.executionId,
          });
          await waitForWpp();
          await waitForWppOperational();
          if (!window.WPP) throw new Error('O módulo do WhatsApp não está disponível. Recarregue a página.');
          const result = await executeScheduledStep(window.WPP, {
            deliveryId: scheduledData.deliveryId,
            executionId: scheduledData.executionId,
            currentStep: scheduledData.currentStep as number,
            chatId: scheduledData.chatId,
            messageId: scheduledData.messageId,
            step: deserializeScheduleStep(scheduledData.step),
          }, ({ deliveryId, executionId, currentStep, messageId, previousMessageId, resolvedChatId: preparedChatId }) => {
            resolvedChatId = preparedChatId;
            return persistPreparedDelivery(deliveryId, executionId, currentStep, messageId, preparedChatId, previousMessageId);
          });
          resolvedChatId = result.resolvedChatId;
          notify('SCHEDULED_DELIVERY_SENT', { deliveryId: scheduledData.deliveryId, executionId: scheduledData.executionId, chatName: scheduledData.chatName, resolvedChatId });
        } catch (error) {
          const message = getErrorMessage(error, 'O WhatsApp interrompeu o envio sem informar o motivo. A mensagem será tentada novamente.');
          notify('SCHEDULED_DELIVERY_ERROR', {
            deliveryId: scheduledData.deliveryId,
            executionId: scheduledData.executionId,
            chatName: scheduledData.chatName,
            resolvedChatId,
            message,
            retryable: isTransientScheduleError(message),
          });
        }
        return;
      }
      await waitForWpp();
      await waitForWppOperational();
      const chat = await getActiveChat();
      if (data.type === 'GET_ACTIVE_CHAT') {
        notify('CHAT_CONTEXT', {
          chatId: chat.id,
          chatName: chat.name,
          phone: await getChatPhone(chat.id, window.WPP?.contact),
          lastInboundAt: await getLastInboundAt(chat.id),
        });
        return;
      }
      if (data.type === 'START_FUNNEL') {
        if (!data.jobId || !data.steps?.length) throw new Error('O funil não possui etapas.');
        notify('FUNNEL_STARTED', { jobId: data.jobId, chatName: chat.name, total: data.steps.length });
        void runFunnel(data.jobId, chat, data.steps);
        return;
      }

      if (data.type === 'SEND_AUDIO') {
        if (!(data.audio?.bytes instanceof ArrayBuffer)) throw new Error('O áudio selecionado está sem conteúdo.');
        await sendAudio(window.WPP, chat.id, data.audio);
        notify('SENT', { chatName: chat.name, kind: 'audio' });
        return;
      }
      if (data.type === 'SEND_IMAGE') {
        if (!(data.image?.bytes instanceof ArrayBuffer)) throw new Error('A imagem selecionada está sem conteúdo.');
        await sendImage(window.WPP, chat.id, data.image);
        notify('SENT', { chatName: chat.name, kind: 'image' });
        return;
      }
      if (data.type === 'SEND_DOCUMENT') {
        if (!(data.document?.bytes instanceof ArrayBuffer)) throw new Error('O documento selecionado está sem conteúdo.');
        await sendDocument(window.WPP, chat.id, data.document);
        notify('SENT', { chatName: chat.name, kind: 'document' });
        return;
      }
      if (!data.text) throw new Error('A mensagem selecionada está sem conteúdo.');
      await sendMessageStep(window.WPP, chat.id, { type: 'text', text: data.text.text });
      notify('SENT', { chatName: chat.name, kind: 'text' });
    } catch (error) {
      if (data.type === 'GET_ACTIVE_CHAT') {
        notify('CHAT_CONTEXT', { chatId: '', chatName: 'Nenhuma conversa aberta', phone: '' });
        return;
      }
      notify('ERROR', { message: getErrorMessage(error, 'Não foi possível enviar a mensagem.') });
    }
  });
}
