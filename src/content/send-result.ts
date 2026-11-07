import { normalizeWhatsAppErrorMessage } from '../shared/utils/whatsapp-error';

export type WhatsAppSendResult = {
  id?: string;
  ack?: number;
  sendMsgResult?: { messageSendResult?: string } | null;
  to?: string;
};

const getErrorField = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return normalizeWhatsAppErrorMessage(error.message);
  if (typeof error === 'string' && error.trim()) return normalizeWhatsAppErrorMessage(error.trim());

  if (Array.isArray(error)) {
    const nestedMessage = error
      .map((item) => getErrorMessage(item, ''))
      .filter(Boolean)
      .join(' · ');
    if (nestedMessage) return nestedMessage;
  }

  if (error && typeof error === 'object') {
    const record = error as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
      reason?: unknown;
      status?: unknown;
      name?: unknown;
    };
    const message = getErrorField(record.message);
    if (message) return normalizeWhatsAppErrorMessage(message);

    if (record.error && typeof record.error === 'object') {
      const nestedMessage = getErrorField((record.error as { message?: unknown }).message);
      if (nestedMessage) return normalizeWhatsAppErrorMessage(nestedMessage);
    }
    const directError = getErrorField(record.error);
    if (directError) return normalizeWhatsAppErrorMessage(directError);

    for (const field of [record.code, record.reason, record.status]) {
      const fieldMessage = getErrorField(field);
      if (fieldMessage) return normalizeWhatsAppErrorMessage(fieldMessage);
    }

    const name = getErrorField(record.name);
    if (name && name !== 'Error') return name;

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return normalizeWhatsAppErrorMessage(serialized.slice(0, 500));
    } catch {
      // O fallback ainda fornece uma mensagem estavel para objetos circulares.
    }
  }

  return fallback;
};

export const confirmSendResult = (result: WhatsAppSendResult | undefined): WhatsAppSendResult => {
  if (!result?.id) throw new Error('O WhatsApp não retornou o identificador da mensagem enviada.');

  const sendStatus = result.sendMsgResult?.messageSendResult;
  if (sendStatus !== 'OK') {
    throw new Error(`O WhatsApp recusou o envio${sendStatus ? `: ${sendStatus}` : '.'}`);
  }

  if (typeof result.ack !== 'number' || result.ack < 1) {
    throw new Error('O WhatsApp não confirmou o recebimento da mensagem pelo servidor.');
  }

  return result;
};
