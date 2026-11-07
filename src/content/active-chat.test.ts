import { describe, expect, it, vi } from 'vitest';
import {
  extractWhatsAppChatId,
  findChatByExactName,
  getChatPhone,
  getSerializedWhatsAppId,
  resolvePhoneChatId,
  type WhatsAppContactApi,
} from './active-chat';

const whatsappId = (value: string): { _serialized: string } => ({ _serialized: value });

describe('active chat identifiers', () => {
  it('extracts only supported WhatsApp identifiers', () => {
    expect(extractWhatsAppChatId('true_5511999999999@c.us_ABCD')).toBe('5511999999999@c.us');
    expect(extractWhatsAppChatId('true_123456:4@lid_ABCD')).toBe('123456@lid');
    expect(extractWhatsAppChatId('prefix:a:4@lid')).toBe('');
    expect(extractWhatsAppChatId('invalid-contact')).toBe('');
  });

  it('never interprets the device number as the LID user', () => {
    const deviceLid = { _serialized: '123:4@lid' };

    expect(extractWhatsAppChatId(deviceLid._serialized)).toBe('123@lid');
    expect(getSerializedWhatsAppId(deviceLid)).toBe('123@lid');
    expect(getSerializedWhatsAppId(deviceLid)).not.toBe('4@lid');
  });

  it('matches a visible chat only when the normalized name is unique', () => {
    const chats = [
      { id: whatsappId('1@c.us'), formattedTitle: 'José da Silva' },
      { id: whatsappId('2@c.us'), formattedTitle: 'Outro contato' },
    ];
    expect(findChatByExactName(chats, 'Jose da Silva')?.id?._serialized).toBe('1@c.us');
    expect(findChatByExactName([...chats, { id: whatsappId('3@c.us'), name: 'José da Silva' }], 'José da Silva')).toBeUndefined();
  });
});

describe('getChatPhone', () => {
  it('reads a phone id directly', async () => {
    await expect(getChatPhone('5511999999999@c.us')).resolves.toBe('5511999999999');
  });

  it('maps a LID to the phone returned by WhatsApp', async () => {
    await expect(getChatPhone('999@lid', {
      getPnLidEntry: vi.fn().mockResolvedValue({ phoneNumber: whatsappId('5511999999999@c.us') }),
    })).resolves.toBe('5511999999999');
  });

  it('does not invent a phone when WhatsApp has no mapping', async () => {
    await expect(getChatPhone('999@lid', {
      getPnLidEntry: vi.fn().mockRejectedValue(new Error('not available')),
    })).resolves.toBe('');
  });
});

describe('resolvePhoneChatId', () => {
  it('keeps a validated phone id when the account has no own LID', async () => {
    const queryExists = vi.fn().mockResolvedValue({
      wid: whatsappId('999@lid'),
      lid: whatsappId('999@lid'),
    });

    await expect(resolvePhoneChatId('5511999999999@c.us', { queryExists }, false))
      .resolves.toBe('5511999999999@c.us');
    expect(queryExists).toHaveBeenCalledWith('5511999999999@c.us');
  });

  it('uses the returned LID only when the account has its own LID ready', async () => {
    const contactApi: WhatsAppContactApi = {
      queryExists: vi.fn().mockResolvedValue({
        wid: whatsappId('5511999999999@c.us'),
        lid: whatsappId('999@lid'),
      }),
    };

    await expect(resolvePhoneChatId('5511999999999@c.us', contactApi, true)).resolves.toBe('999@lid');
  });

  it('maps a captured LID back to its phone id when the own LID is unavailable', async () => {
    const contactApi: WhatsAppContactApi = {
      getPnLidEntry: vi.fn().mockResolvedValue({ phoneNumber: whatsappId('5511999999999@c.us') }),
    };

    await expect(resolvePhoneChatId('999@lid', contactApi, false)).resolves.toBe('5511999999999@c.us');
  });

  it('preserves a captured LID when the session is ready for LID messages', async () => {
    const getPnLidEntry = vi.fn();
    await expect(resolvePhoneChatId('999@lid', { getPnLidEntry }, true)).resolves.toBe('999@lid');
    expect(getPnLidEntry).not.toHaveBeenCalled();
  });

  it('rejects a phone that WhatsApp does not recognize', async () => {
    await expect(resolvePhoneChatId('5511000000000@c.us', {
      queryExists: vi.fn().mockResolvedValue(null),
    })).rejects.toThrow('não foi encontrado no WhatsApp');
  });
});
