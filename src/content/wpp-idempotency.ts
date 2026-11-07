import type { WhatsAppApi } from './wpp-api';
import { getErrorMessage } from './send-result';

export type ExistingMessageState = 'missing' | 'pending' | 'confirmed' | 'failed';

export const messageIdTargetsChat = (messageId: string, chatId: string): boolean => (
  messageId.includes(`_${chatId}_`)
);

export const generateMessageId = async (wpp: WhatsAppApi, chatId: string): Promise<string> => {
  if (!wpp.chat.generateMessageID) {
    throw new Error('O WhatsApp não disponibilizou a geração segura do identificador da mensagem. Tentaremos novamente.');
  }

  const generated = await wpp.chat.generateMessageID(chatId);
  const messageId = typeof generated === 'string' ? generated : generated?.toString();
  if (!messageId || !messageId.includes(chatId)) {
    throw new Error('O WhatsApp retornou um identificador de mensagem inválido. Tentaremos novamente.');
  }
  return messageId;
};

export const getExistingMessageState = async (wpp: WhatsAppApi, messageId: string): Promise<ExistingMessageState> => {
  if (!wpp.chat.getMessageById) {
    throw new Error('O WhatsApp não disponibilizou a verificação de mensagens anteriores. Tentaremos novamente sem duplicar o envio.');
  }

  try {
    const message = await wpp.chat.getMessageById(messageId);
    if (!message) return 'missing';
    if (typeof message.ack !== 'number' || message.ack === 0) return 'pending';
    return message.ack > 0 ? 'confirmed' : 'failed';
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    if (code === 'msg_not_found') return 'missing';
    throw new Error(`Não foi possível verificar a tentativa anterior: ${getErrorMessage(error, 'motivo não informado')}`);
  }
};
