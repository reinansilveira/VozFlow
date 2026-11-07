import { describe, expect, it } from 'vitest';
import { getScheduleFailurePolicy, isTransientScheduleError } from './schedule-retry';

describe('schedule retry classification', () => {
  it.each([
    'No LID for user',
    'O WhatsApp ainda está sincronizando a identificação da sua conta.',
    'O WhatsApp não terminou de carregar ou está sem conexão.',
    'Abra o WhatsApp Web para continuar os envios agendados.',
    'Could not establish connection. Receiving end does not exist.',
    'A mensagem anterior ainda aguarda confirmação do WhatsApp.',
    'A confirmação do WhatsApp ainda está pendente. O envio será verificado antes de qualquer nova tentativa.',
  ])('keeps an environmental failure in the queue: %s', (message) => {
    expect(isTransientScheduleError(message)).toBe(true);
  });

  it.each([
    'O número +5579999999999 não foi encontrado no WhatsApp.',
    'O WhatsApp recusou o envio: ERROR',
    'A etapa programada não existe mais.',
  ])('counts a real delivery failure: %s', (message) => {
    expect(isTransientScheduleError(message)).toBe(false);
  });

  it('does not consume or exhaust attempts while the WhatsApp runtime is unavailable', () => {
    expect(getScheduleFailurePolicy({
      attemptCount: 3,
      campaignIsScheduled: true,
      error: 'No LID for user',
      maxAttempts: 3,
    })).toEqual({
      transient: true,
      shouldRetry: true,
      delayMs: 30_000,
      attemptCount: 2,
    });
  });

  it('stops after the configured number of real delivery failures', () => {
    expect(getScheduleFailurePolicy({
      attemptCount: 3,
      campaignIsScheduled: true,
      error: 'O número não foi encontrado.',
      maxAttempts: 3,
    })).toEqual({
      transient: false,
      shouldRetry: false,
      delayMs: 300_000,
      attemptCount: 3,
    });
  });
});
