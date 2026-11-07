import type { ScheduleStep } from '../shared/types';
import { generateMessageId, getExistingMessageState, messageIdTargetsChat } from './wpp-idempotency';
import { sendMessageStep } from './wpp-sender';
import { resolveScheduledDestination } from './wpp-session';
import type { WhatsAppApi } from './wpp-api';

export type ScheduledExecution = {
  deliveryId: string;
  executionId: string;
  currentStep: number;
  chatId: string;
  messageId?: string;
  step: ScheduleStep;
};

export type PreparedMessage = {
  deliveryId: string;
  executionId: string;
  currentStep: number;
  messageId: string;
  previousMessageId?: string;
  resolvedChatId: string;
};

export type ScheduledExecutionResult = Pick<PreparedMessage, 'messageId' | 'resolvedChatId'>;

export const executeScheduledStep = async (
  wpp: WhatsAppApi,
  execution: ScheduledExecution,
  persistPreparation: (preparation: PreparedMessage) => Promise<void>,
): Promise<ScheduledExecutionResult> => {
  const resolvedChatId = await resolveScheduledDestination(wpp, execution.chatId);
  const existingMessageState = execution.messageId
    ? await getExistingMessageState(wpp, execution.messageId)
    : 'missing';

  if (existingMessageState === 'pending') {
    throw new Error('A mensagem anterior ainda aguarda confirmação do WhatsApp. Não enviaremos uma duplicata.');
  }
  if (existingMessageState === 'failed') {
    throw new Error('O WhatsApp marcou a tentativa anterior como falha. Revise a conversa e tente novamente.');
  }

  if (existingMessageState === 'confirmed' && execution.messageId) {
    return { messageId: execution.messageId, resolvedChatId };
  }

  const previousMessageId = execution.messageId && !messageIdTargetsChat(execution.messageId, resolvedChatId)
    ? execution.messageId
    : undefined;
  const messageId = previousMessageId || !execution.messageId
    ? await generateMessageId(wpp, resolvedChatId)
    : execution.messageId;

  await persistPreparation({
    deliveryId: execution.deliveryId,
    executionId: execution.executionId,
    currentStep: execution.currentStep,
    messageId,
    ...(previousMessageId ? { previousMessageId } : {}),
    resolvedChatId,
  });

  if (existingMessageState === 'missing') {
    await sendMessageStep(wpp, resolvedChatId, execution.step, { messageId });
  }

  return { messageId, resolvedChatId };
};
