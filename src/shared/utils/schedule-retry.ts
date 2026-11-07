const transientFailurePatterns = [
  /no lid for user/i,
  /sincroniz/i,
  /preparando a identificação segura/i,
  /ainda está carregando/i,
  /não terminou de carregar/i,
  /sem conexão/i,
  /abra o whatsapp web/i,
  /módulo do whatsapp/i,
  /validação de contatos/i,
  /fila não confirmou a preparação/i,
  /mensagem anterior ainda aguarda confirmação/i,
  /confirmação do whatsapp ainda está pendente/i,
  /não foi possível verificar a tentativa anterior/i,
  /não disponibilizou a (?:geração|verificação)/i,
  /receiving end does not exist/i,
  /message port closed/i,
  /extension context invalidated/i,
];

export const transientScheduleRetryDelayMs = 30 * 1000;
export const regularScheduleRetryDelayMs = 5 * 60 * 1000;

export const isTransientScheduleError = (message?: string): boolean => {
  if (!message) return false;
  return transientFailurePatterns.some((pattern) => pattern.test(message));
};

type ScheduleFailurePolicyInput = {
  attemptCount: number;
  campaignIsScheduled: boolean;
  error?: string;
  explicitlyRetryable?: boolean;
  maxAttempts: number;
};

export type ScheduleFailurePolicy = {
  attemptCount: number;
  delayMs: number;
  shouldRetry: boolean;
  transient: boolean;
};

export const getScheduleFailurePolicy = ({
  attemptCount,
  campaignIsScheduled,
  error,
  explicitlyRetryable = false,
  maxAttempts,
}: ScheduleFailurePolicyInput): ScheduleFailurePolicy => {
  const transient = explicitlyRetryable || isTransientScheduleError(error);
  return {
    transient,
    shouldRetry: campaignIsScheduled && (transient || attemptCount < maxAttempts),
    delayMs: transient ? transientScheduleRetryDelayMs : regularScheduleRetryDelayMs,
    attemptCount: transient ? Math.max(0, attemptCount - 1) : attemptCount,
  };
};
