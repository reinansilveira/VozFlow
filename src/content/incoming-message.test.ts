import { describe, expect, it } from 'vitest';
import { findLastInboundAt, parseIncomingMessage, type WhatsAppIncomingMessage } from './incoming-message';

const now = 1_800_000_000_000;
const message = (overrides: Partial<WhatsAppIncomingMessage> = {}): WhatsAppIncomingMessage => ({
  id: { fromMe: false, remote: { _serialized: '5511999990000@c.us' } },
  body: 'Qual o preço?',
  type: 'chat',
  t: now / 1000 - 10,
  isNewMsg: true,
  notifyName: 'Maria',
  ...overrides,
});

describe('incoming message filter', () => {
  it('reads new messages received in individual chats', () => {
    expect(parseIncomingMessage(message(), now)).toEqual({
      chatId: '5511999990000@c.us',
      text: 'Qual o preço?',
      isGroup: false,
      timestamp: now - 10_000,
      senderName: 'Maria',
    });
  });

  it('marks group messages and uses media captions', () => {
    const parsed = parseIncomingMessage(message({ id: { fromMe: false, remote: '1203630@g.us' }, type: 'image', body: 'base64', caption: 'preço' }), now);
    expect(parsed).toMatchObject({ chatId: '1203630@g.us', isGroup: true, text: 'preço' });
  });

  it('ignores own, old, history, status and channel messages', () => {
    expect(parseIncomingMessage(message({ id: { fromMe: true, remote: '5511999990000@c.us' } }), now)).toBeNull();
    expect(parseIncomingMessage(message({ isNewMsg: false }), now)).toBeNull();
    expect(parseIncomingMessage(message({ t: now / 1000 - 600 }), now)).toBeNull();
    expect(parseIncomingMessage(message({ isStatusV3: true }), now)).toBeNull();
    expect(parseIncomingMessage(message({ id: { fromMe: false, remote: 'status@broadcast' } }), now)).toBeNull();
    expect(parseIncomingMessage(message({ id: { fromMe: false, remote: '123@newsletter' } }), now)).toBeNull();
  });

  it('finds the last message sent by the contact', () => {
    expect(findLastInboundAt([
      message({ t: 100 }),
      message({ id: { fromMe: true }, t: 300 }),
      message({ t: 200 }),
    ])).toBe(200_000);
    expect(findLastInboundAt([message({ id: { fromMe: true }, t: 300 })])).toBeUndefined();
  });
});
