import { describe, expect, it } from 'vitest';
import { confirmSendResult, getErrorMessage } from './send-result';

describe('confirmSendResult', () => {
  it('accepts only a message confirmed by the WhatsApp server', () => {
    const result = { id: 'message-id', ack: 1, sendMsgResult: { messageSendResult: 'OK' } };
    expect(confirmSendResult(result)).toBe(result);
  });

  it.each([
    [{ ack: 1, sendMsgResult: { messageSendResult: 'OK' } }, 'identificador'],
    [{ id: 'message-id', ack: 1, sendMsgResult: { messageSendResult: 'ERROR' } }, 'recusou'],
    [{ id: 'message-id', ack: 0, sendMsgResult: { messageSendResult: 'OK' } }, 'não confirmou'],
    [{ id: 'message-id', ack: 1, sendMsgResult: null }, 'recusou'],
  ])('rejects an unconfirmed result %#', (result, expectedMessage) => {
    expect(() => confirmSendResult(result)).toThrow(expectedMessage);
  });
});

describe('getErrorMessage', () => {
  it('keeps actionable messages from the different rejection shapes used by WhatsApp', () => {
    expect(getErrorMessage(new Error('Falha real'), 'fallback')).toBe('Falha real');
    expect(getErrorMessage({ error: { message: 'Falha interna' } }, 'fallback')).toBe('Falha interna');
    expect(getErrorMessage({ reason: 'No LID for user' }, 'fallback')).toContain('sincronizando');
    expect(getErrorMessage({ status: 503 }, 'fallback')).toBe('503');
    expect(getErrorMessage([undefined, { code: 'contact_not_found' }], 'fallback')).toBe('contact_not_found');
  });

  it('translates the LID reload race from every common rejection shape', () => {
    const expectedMessage = 'O WhatsApp ainda está sincronizando a identificação da sua conta.';

    expect(getErrorMessage(new Error('No LID for user'), 'fallback')).toBe(expectedMessage);
    expect(getErrorMessage('No LID for user', 'fallback')).toBe(expectedMessage);
    expect(getErrorMessage({ error: 'No LID for user' }, 'fallback')).toBe(expectedMessage);
    expect(getErrorMessage({ message: 'Error: No LID for user' }, 'fallback')).toBe(expectedMessage);
  });

  it('uses a clear fallback for empty or undefined rejections', () => {
    expect(getErrorMessage(undefined, 'Motivo não informado')).toBe('Motivo não informado');
    expect(getErrorMessage({}, 'Motivo não informado')).toBe('Motivo não informado');
  });
});
