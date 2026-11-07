import { describe, expect, it, vi } from 'vitest';
import type { WhatsAppApi, WhatsAppChatApi } from './wpp-api';
import {
  sendAudio,
  sendConfirmationTimeoutMs,
  sendDocument,
  sendImage,
  sendMessageStep,
} from './wpp-sender';

const createWpp = (sendTextMessage: WhatsAppChatApi['sendTextMessage']): WhatsAppApi => ({
  loader: {
    injectLoader: () => undefined,
    onReady: () => undefined,
  },
  chat: {
    getActiveChat: () => undefined,
    sendFileMessage: async () => ({ id: 'file', ack: 1, sendMsgResult: { messageSendResult: 'OK' } }),
    sendTextMessage,
    markIsRecording: async () => undefined,
    markIsComposing: async () => undefined,
    markIsPaused: async () => undefined,
  },
});

describe('sendMessageStep', () => {
  it('requests ACK confirmation for text messages', async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({
      id: 'message-id',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });
    const wpp = createWpp(sendTextMessage);

    await expect(sendMessageStep(wpp, '5511999999999@c.us', { type: 'text', text: 'Teste' }))
      .resolves.toMatchObject({ id: 'message-id', ack: 1 });
    expect(sendTextMessage).toHaveBeenCalledWith('5511999999999@c.us', 'Teste', { waitForAck: true });
  });

  it('reuses the prepared message id during a scheduled retry', async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({
      id: 'prepared-message-id',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });

    await sendMessageStep(
      createWpp(sendTextMessage),
      'contact@lid',
      { type: 'text', text: 'Teste' },
      { messageId: 'true_contact@lid_PREPARED' },
    );

    expect(sendTextMessage).toHaveBeenCalledWith('contact@lid', 'Teste', {
      waitForAck: true,
      messageId: 'true_contact@lid_PREPARED',
    });
  });

  it('does not report success when WhatsApp returns a message without server ACK', async () => {
    const wpp = createWpp(vi.fn().mockResolvedValue({
      id: 'message-id',
      ack: 0,
      sendMsgResult: { messageSendResult: 'OK' },
    }));

    await expect(sendMessageStep(wpp, 'contact@lid', { type: 'text', text: 'Teste' }))
      .rejects.toThrow('não confirmou');
  });

  it('stops waiting before the execution lease can expire when WhatsApp never answers', async () => {
    vi.useFakeTimers();
    try {
      const stalledRequest = new Promise<never>(() => undefined);
      const pendingSend = sendMessageStep(
        createWpp(vi.fn(() => stalledRequest)),
        'contact@lid',
        { type: 'text', text: 'Teste' },
      );
      const rejection = expect(pendingSend).rejects.toThrow('confirmação do WhatsApp ainda está pendente');

      await vi.advanceTimersByTimeAsync(sendConfirmationTimeoutMs);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a media step that lost its binary content in transport', async () => {
    const wpp = createWpp(vi.fn());
    await expect(sendMessageStep(wpp, 'contact@lid', { type: 'audio' }))
      .rejects.toThrow('sem conteúdo');
  });

  it.each([
    ['audio', (wpp: WhatsAppApi) => sendAudio(wpp, 'contact@lid', { name: 'Boas-vindas', bytes: Uint8Array.of(1, 2).buffer })],
    ['image', (wpp: WhatsAppApi) => sendImage(wpp, 'contact@lid', { name: 'Capa', mimeType: 'image/png', bytes: Uint8Array.of(3, 4).buffer })],
    ['document', (wpp: WhatsAppApi) => sendDocument(wpp, 'contact@lid', { name: 'Proposta', fileName: 'original.pdf', mimeType: 'application/pdf', bytes: Uint8Array.of(5, 6).buffer })],
  ])('requests ACK confirmation for %s files', async (expectedType, send) => {
    const sendFileMessage = vi.fn().mockResolvedValue({
      id: 'file-id',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });
    const wpp = createWpp(vi.fn());
    wpp.chat.sendFileMessage = sendFileMessage;

    await expect(send(wpp)).resolves.toMatchObject({ id: 'file-id', ack: 1 });
    expect(sendFileMessage).toHaveBeenCalledOnce();
    expect(sendFileMessage.mock.calls[0]?.[2]).toMatchObject({ type: expectedType, waitForAck: true });
  });
});
