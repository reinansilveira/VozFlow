import type { ScheduleStep } from '../shared/types';
import { confirmSendResult, type WhatsAppSendResult } from './send-result';
import type { WhatsAppApi } from './wpp-api';

type AudioPayload = { name?: string; bytes: ArrayBuffer };
type ImagePayload = { name?: string; mimeType?: string; bytes: ArrayBuffer };
type DocumentPayload = { name?: string; fileName?: string; mimeType?: string; bytes: ArrayBuffer };
type SendOptions = { messageId?: string };

export const sendConfirmationTimeoutMs = 4 * 60 * 1000;

const waitForSendConfirmation = (request: Promise<WhatsAppSendResult>): Promise<WhatsAppSendResult> => new Promise((resolve, reject) => {
  const timeout = globalThis.setTimeout(() => {
    reject(new Error('A confirmação do WhatsApp ainda está pendente. O envio será verificado antes de qualquer nova tentativa.'));
  }, sendConfirmationTimeoutMs);

  request.then(
    (result) => {
      globalThis.clearTimeout(timeout);
      resolve(result);
    },
    (error: unknown) => {
      globalThis.clearTimeout(timeout);
      reject(error);
    },
  );
});

const getSendOptions = (options?: SendOptions): Record<string, unknown> => ({
  waitForAck: true,
  ...(options?.messageId ? { messageId: options.messageId } : {}),
});

const requireWpp = (wpp?: WhatsAppApi): WhatsAppApi => {
  if (!wpp) throw new Error('O módulo do WhatsApp não está disponível. Recarregue a página.');
  return wpp;
};

export const sendAudio = async (wpp: WhatsAppApi | undefined, chatId: string, audio: AudioPayload, options?: SendOptions): Promise<WhatsAppSendResult> => {
  const api = requireWpp(wpp);
  const file = new File([audio.bytes], `${audio.name || 'audio'}.ogg`, { type: 'audio/ogg; codecs=opus' });
  const result = await waitForSendConfirmation(api.chat.sendFileMessage(chatId, file, {
    type: 'audio',
    isPtt: true,
    waveform: true,
    filename: file.name,
    mimetype: file.type,
    ...getSendOptions(options),
  }));
  return confirmSendResult(result);
};

export const sendImage = async (wpp: WhatsAppApi | undefined, chatId: string, image: ImagePayload, options?: SendOptions): Promise<WhatsAppSendResult> => {
  const api = requireWpp(wpp);
  const mimeType = image.mimeType || 'image/jpeg';
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const file = new File([image.bytes], `${image.name || 'imagem'}.${extension}`, { type: mimeType });
  const result = await waitForSendConfirmation(api.chat.sendFileMessage(chatId, file, {
    type: 'image',
    filename: file.name,
    mimetype: mimeType,
    ...getSendOptions(options),
  }));
  return confirmSendResult(result);
};

const getDocumentFileName = (document: Pick<DocumentPayload, 'name' | 'fileName'>): string => {
  const originalName = document.fileName || 'documento';
  const extensionIndex = originalName.lastIndexOf('.');
  const extension = extensionIndex > -1 ? originalName.slice(extensionIndex) : '';
  const originalBaseName = extensionIndex > -1 ? originalName.slice(0, extensionIndex) : originalName;
  const safeName = (document.name || originalBaseName || 'documento').replace(/[\\/:*?"<>|]/g, '-');
  return safeName.toLowerCase().endsWith(extension.toLowerCase()) ? safeName : `${safeName}${extension}`;
};

export const sendDocument = async (wpp: WhatsAppApi | undefined, chatId: string, document: DocumentPayload, options?: SendOptions): Promise<WhatsAppSendResult> => {
  const api = requireWpp(wpp);
  const fileName = getDocumentFileName(document);
  const mimeType = document.mimeType || 'application/octet-stream';
  const file = new File([document.bytes], fileName, { type: mimeType });
  const result = await waitForSendConfirmation(api.chat.sendFileMessage(chatId, file, {
    type: 'document',
    filename: file.name,
    mimetype: mimeType,
    ...getSendOptions(options),
  }));
  return confirmSendResult(result);
};

export const sendMessageStep = async (
  wpp: WhatsAppApi | undefined,
  chatId: string,
  step: Pick<ScheduleStep, 'type' | 'name' | 'fileName' | 'text' | 'mimeType' | 'bytes'>,
  options?: SendOptions,
): Promise<WhatsAppSendResult> => {
  const api = requireWpp(wpp);
  if (step.type === 'text') {
    const result = await waitForSendConfirmation(
      api.chat.sendTextMessage(chatId, step.text || '', getSendOptions(options)),
    );
    return confirmSendResult(result);
  }
  if (step.type === 'image' && step.bytes instanceof ArrayBuffer) {
    return sendImage(api, chatId, { name: step.name, mimeType: step.mimeType, bytes: step.bytes }, options);
  }
  if (step.type === 'document' && step.bytes instanceof ArrayBuffer) {
    return sendDocument(api, chatId, {
      name: step.name,
      fileName: step.fileName,
      mimeType: step.mimeType,
      bytes: step.bytes,
    }, options);
  }
  if (step.type === 'audio' && step.bytes instanceof ArrayBuffer) return sendAudio(api, chatId, { name: step.name, bytes: step.bytes }, options);
  throw new Error('Uma etapa do funil está sem conteúdo.');
};
