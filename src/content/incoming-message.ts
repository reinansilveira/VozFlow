import { getSerializedWhatsAppId, type WhatsAppChatId } from './active-chat';

// Filtra os eventos `chat.new_message` do WhatsApp antes de repassá-los à automação.

export type WhatsAppIncomingMessage = {
  id?: { fromMe?: boolean; remote?: WhatsAppChatId | string };
  from?: WhatsAppChatId | string;
  body?: unknown;
  caption?: unknown;
  type?: string;
  t?: number;
  isNewMsg?: boolean;
  broadcast?: boolean;
  isStatusV3?: boolean;
  notifyName?: string;
};

export type ParsedIncomingMessage = {
  chatId: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
  senderName: string;
};

export const maxIncomingMessageAgeMs = 5 * 60 * 1000;

const readId = (value?: WhatsAppChatId | string): string => (
  typeof value === 'string' ? getSerializedWhatsAppId({ _serialized: value }) : getSerializedWhatsAppId(value)
);

const readText = (message: WhatsAppIncomingMessage): string => {
  if (message.type === 'chat' && typeof message.body === 'string') return message.body;
  return typeof message.caption === 'string' ? message.caption : '';
};

export const parseIncomingMessage = (message: WhatsAppIncomingMessage | undefined, now: number): ParsedIncomingMessage | null => {
  if (!message || message.id?.fromMe !== false || message.isNewMsg !== true) return null;
  if (message.broadcast || message.isStatusV3) return null;
  const chatId = readId(message.id.remote) || readId(message.from);
  if (!chatId || chatId.endsWith('@newsletter') || chatId.startsWith('status@')) return null;
  const timestamp = typeof message.t === 'number' ? message.t * 1000 : now;
  if (now - timestamp > maxIncomingMessageAgeMs) return null;
  return {
    chatId,
    text: readText(message).trim(),
    isGroup: chatId.endsWith('@g.us'),
    timestamp,
    senderName: (message.notifyName || '').trim(),
  };
};

// Última mensagem recebida do contato numa lista de mensagens da conversa (em ms).
export const findLastInboundAt = (messages: WhatsAppIncomingMessage[]): number | undefined => {
  const times = messages
    .filter((message) => message.id?.fromMe === false && typeof message.t === 'number')
    .map((message) => (message.t as number) * 1000);
  return times.length ? Math.max(...times) : undefined;
};
