import { describe, expect, it, vi } from 'vitest';
import { executeScheduledStep } from './scheduled-executor';
import type { WhatsAppApi, WhatsAppChatApi } from './wpp-api';

const whatsappId = (value: string): { _serialized: string } => ({ _serialized: value });

const createChatApi = (overrides: Partial<WhatsAppChatApi> = {}): WhatsAppChatApi => ({
  getActiveChat: () => undefined,
  sendFileMessage: async () => ({ id: 'file', ack: 1, sendMsgResult: { messageSendResult: 'OK' } }),
  sendTextMessage: async () => ({ id: 'text', ack: 1, sendMsgResult: { messageSendResult: 'OK' } }),
  markIsRecording: async () => undefined,
  markIsComposing: async () => undefined,
  markIsPaused: async () => undefined,
  ...overrides,
});

describe('executeScheduledStep', () => {
  it('completes the exact migrated-account flow after repairing WhatsApp own LID getter', async () => {
    const userPrefs = {
      getMaybeMeLidUser: vi.fn(() => whatsappId('self@lid')),
      getMeLidUserOrThrow: vi.fn(() => { throw new Error('No LID for user'); }),
    };
    const sendTextMessage = vi.fn().mockResolvedValue({
      id: 'true_contact@lid_NEW',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });
    const persistPreparation = vi.fn().mockResolvedValue(undefined);
    const wpp: WhatsAppApi = {
      loader: { injectLoader: () => undefined, onReady: () => undefined },
      chat: createChatApi({
        find: vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') }),
        generateMessageID: vi.fn().mockResolvedValue('true_contact@lid_NEW'),
        sendTextMessage,
      }),
      conn: {
        getMigrationState: () => ({ isLidMigrated: true }),
        getMyUserLid: () => userPrefs.getMeLidUserOrThrow(),
      },
      contact: {
        queryExists: vi.fn().mockResolvedValue({
          wid: whatsappId('5511999999999@c.us'),
          lid: whatsappId('contact@lid'),
        }),
      },
      whatsapp: { UserPrefs: userPrefs },
    };

    await expect(executeScheduledStep(wpp, {
      deliveryId: 'delivery-migrated',
      executionId: 'execution-migrated',
      currentStep: 0,
      chatId: '5511999999999@c.us',
      step: { type: 'text', text: 'Teste', delaySeconds: 0 },
    }, persistPreparation)).resolves.toEqual({
      messageId: 'true_contact@lid_NEW',
      resolvedChatId: 'contact@lid',
    });

    expect(persistPreparation).toHaveBeenCalledBefore(sendTextMessage);
    expect(sendTextMessage).toHaveBeenCalledWith(
      'contact@lid',
      'Teste',
      expect.objectContaining({ messageId: 'true_contact@lid_NEW', waitForAck: true }),
    );
  });

  it('persists the WhatsApp message id before the first confirmed send', async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({
      id: 'true_5511999999999@c.us_NEW',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });
    const persistPreparation = vi.fn().mockResolvedValue(undefined);
    const wpp: WhatsAppApi = {
      loader: { injectLoader: () => undefined, onReady: () => undefined },
      chat: createChatApi({
        find: vi.fn().mockResolvedValue({ id: whatsappId('5511999999999@c.us') }),
        generateMessageID: vi.fn().mockResolvedValue('true_5511999999999@c.us_NEW'),
        sendTextMessage,
      }),
      contact: {
        queryExists: vi.fn().mockResolvedValue({ wid: whatsappId('5511999999999@c.us') }),
      },
    };

    await expect(executeScheduledStep(wpp, {
      deliveryId: 'delivery-1',
      executionId: 'execution-1',
      currentStep: 0,
      chatId: '5511999999999@c.us',
      step: { type: 'text', text: 'Teste', delaySeconds: 0 },
    }, persistPreparation)).resolves.toEqual({
      messageId: 'true_5511999999999@c.us_NEW',
      resolvedChatId: '5511999999999@c.us',
    });

    expect(persistPreparation).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      executionId: 'execution-1',
      currentStep: 0,
      messageId: 'true_5511999999999@c.us_NEW',
      resolvedChatId: '5511999999999@c.us',
    });
    expect(persistPreparation.mock.invocationCallOrder[0]).toBeLessThan(sendTextMessage.mock.invocationCallOrder[0]);
  });

  it('finishes a recovered attempt without sending again when its id is confirmed', async () => {
    const sendTextMessage = vi.fn();
    const generateMessageID = vi.fn();
    const wpp: WhatsAppApi = {
      loader: { injectLoader: () => undefined, onReady: () => undefined },
      chat: createChatApi({
        find: vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') }),
        generateMessageID,
        getMessageById: vi.fn().mockResolvedValue({ ack: 1 }),
        sendTextMessage,
      }),
      conn: {
        getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => whatsappId('self@lid'),
      },
    };

    await executeScheduledStep(wpp, {
      deliveryId: 'delivery-2',
      executionId: 'execution-2',
      currentStep: 1,
      chatId: 'contact@lid',
      messageId: 'true_contact@lid_EXISTING',
      step: { type: 'text', text: 'Teste', delaySeconds: 0 },
    }, vi.fn().mockResolvedValue(undefined));

    expect(generateMessageID).not.toHaveBeenCalled();
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('does not duplicate a recovered message that is still pending', async () => {
    const sendTextMessage = vi.fn();
    const wpp: WhatsAppApi = {
      loader: { injectLoader: () => undefined, onReady: () => undefined },
      chat: createChatApi({
        find: vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') }),
        getMessageById: vi.fn().mockResolvedValue({ ack: 0 }),
        sendTextMessage,
      }),
      conn: {
        getMigrationState: () => ({ currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => whatsappId('self@lid'),
      },
    };

    await expect(executeScheduledStep(wpp, {
      deliveryId: 'delivery-3',
      executionId: 'execution-3',
      currentStep: 0,
      chatId: 'contact@lid',
      messageId: 'true_contact@lid_PENDING',
      step: { type: 'text', text: 'Teste', delaySeconds: 0 },
    }, vi.fn().mockResolvedValue(undefined))).rejects.toThrow('Não enviaremos uma duplicata');
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('safely replaces a missing phone message id when the chat becomes canonical LID', async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({
      id: 'true_contact@lid_NEW',
      ack: 1,
      sendMsgResult: { messageSendResult: 'OK' },
    });
    const persistPreparation = vi.fn().mockResolvedValue(undefined);
    const wpp: WhatsAppApi = {
      loader: { injectLoader: () => undefined, onReady: () => undefined },
      chat: createChatApi({
        find: vi.fn().mockResolvedValue({ id: whatsappId('contact@lid') }),
        generateMessageID: vi.fn().mockResolvedValue('true_contact@lid_NEW'),
        getMessageById: vi.fn().mockResolvedValue(undefined),
        sendTextMessage,
      }),
      conn: {
        getMigrationState: () => ({ isLidMigrated: true, currentLid: whatsappId('self@lid') }),
        getMyUserLid: () => whatsappId('self@lid'),
      },
      contact: {
        queryExists: vi.fn().mockResolvedValue({
          wid: whatsappId('5511999999999@c.us'),
          lid: whatsappId('contact@lid'),
        }),
      },
    };

    await expect(executeScheduledStep(wpp, {
      deliveryId: 'delivery-4',
      executionId: 'execution-4',
      currentStep: 0,
      chatId: '5511999999999@c.us',
      messageId: 'true_5511999999999@c.us_OLD',
      step: { type: 'text', text: 'Teste', delaySeconds: 0 },
    }, persistPreparation)).resolves.toEqual({
      messageId: 'true_contact@lid_NEW',
      resolvedChatId: 'contact@lid',
    });

    expect(persistPreparation).toHaveBeenCalledWith({
      deliveryId: 'delivery-4',
      executionId: 'execution-4',
      currentStep: 0,
      messageId: 'true_contact@lid_NEW',
      previousMessageId: 'true_5511999999999@c.us_OLD',
      resolvedChatId: 'contact@lid',
    });
    expect(sendTextMessage).toHaveBeenCalledWith(
      'contact@lid',
      'Teste',
      expect.objectContaining({ messageId: 'true_contact@lid_NEW', waitForAck: true }),
    );
  });
});
