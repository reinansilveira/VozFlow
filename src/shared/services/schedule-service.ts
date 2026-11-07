import type { ScheduledCampaign, ScheduledDelivery } from '../types';
import { getScheduleFailurePolicy, isTransientScheduleError } from '../utils/schedule-retry';
import { getRemarketingDeferral, isRemarketingCampaign } from '../utils/remarketing';
import { getAllItems, getItem, openLibrary } from './library-service';

const processingTimeoutMs = 10 * 60 * 1000;
const unacknowledgedExecutionTimeoutMs = 30 * 1000;
const maxAttempts = 3;

// Permite ao background segurar campanhas (ex.: remarketing pausado ou sem plano Pro) sem alterá-las.
export type CampaignFilter = (campaign: ScheduledCampaign) => boolean;
const runAll: CampaignFilter = () => true;

export type ScheduleSnapshot = {
  campaigns: ScheduledCampaign[];
  deliveries: ScheduledDelivery[];
};

const waitForTransaction = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('A alteração do agendamento foi interrompida.'));
});

export const getScheduleSnapshot = async (database?: IDBDatabase): Promise<ScheduleSnapshot> => {
  const scheduleDatabase = database || await openLibrary();
  const [campaigns, deliveries] = await Promise.all([
    getAllItems<ScheduledCampaign>(scheduleDatabase, 'campaigns'),
    getAllItems<ScheduledDelivery>(scheduleDatabase, 'deliveries'),
  ]);
  return {
    campaigns: campaigns.sort((first, second) => second.createdAt - first.createdAt),
    deliveries: deliveries.sort((first, second) => first.scheduledAt - second.scheduledAt),
  };
};

export const createSchedule = async (campaign: ScheduledCampaign, deliveries: ScheduledDelivery[]): Promise<void> => {
  const database = await openLibrary();
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').add(campaign);
  deliveries.forEach((delivery) => transaction.objectStore('deliveries').add(delivery));
  await waitForTransaction(transaction);
};

export const updateSchedule = async (campaign: ScheduledCampaign, deliveries: ScheduledDelivery[]): Promise<void> => {
  const database = await openLibrary();
  const currentDeliveries = (await getAllItems<ScheduledDelivery>(database, 'deliveries')).filter((delivery) => delivery.campaignId === campaign.id);
  if (currentDeliveries.some((delivery) => delivery.status === 'sent' || delivery.status === 'processing')) {
    throw new Error('Pause antes do primeiro envio para editar esta campanha.');
  }
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').put(campaign);
  currentDeliveries.forEach((delivery) => transaction.objectStore('deliveries').delete(delivery.id));
  deliveries.forEach((delivery) => transaction.objectStore('deliveries').add(delivery));
  await waitForTransaction(transaction);
};

const updateCampaignAndDeliveries = async (
  campaignId: string,
  updateCampaign: (campaign: ScheduledCampaign) => ScheduledCampaign,
  updateDelivery: (delivery: ScheduledDelivery) => ScheduledDelivery,
): Promise<void> => {
  const database = await openLibrary();
  const campaign = await getItem<ScheduledCampaign>(database, 'campaigns', campaignId);
  if (!campaign) throw new Error('Campanha não encontrada.');
  const deliveries = (await getAllItems<ScheduledDelivery>(database, 'deliveries')).filter((delivery) => delivery.campaignId === campaignId);
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').put(updateCampaign(campaign));
  deliveries.forEach((delivery) => transaction.objectStore('deliveries').put(updateDelivery(delivery)));
  await waitForTransaction(transaction);
};

export const pauseSchedule = (campaignId: string): Promise<void> => updateCampaignAndDeliveries(
  campaignId,
  (campaign) => ({ ...campaign, status: 'paused', updatedAt: Date.now() }),
  (delivery) => ['pending', 'retrying'].includes(delivery.status) ? { ...delivery, status: 'paused' } : delivery,
);

export const resumeSchedule = (campaignId: string): Promise<void> => updateCampaignAndDeliveries(
  campaignId,
  (campaign) => ({ ...campaign, status: 'scheduled', updatedAt: Date.now() }),
  (delivery) => delivery.status === 'paused' ? { ...delivery, status: 'pending' } : delivery,
);

export const cancelSchedule = (campaignId: string): Promise<void> => updateCampaignAndDeliveries(
  campaignId,
  (campaign) => ({ ...campaign, status: 'cancelled', updatedAt: Date.now() }),
  (delivery) => ['sent', 'error'].includes(delivery.status) ? delivery : { ...delivery, status: 'cancelled' },
);

export const retryDelivery = async (deliveryId: string): Promise<void> => {
  const database = await openLibrary();
  const delivery = await getItem<ScheduledDelivery>(database, 'deliveries', deliveryId);
  if (!delivery) throw new Error('Entrega não encontrada.');
  const campaign = await getItem<ScheduledCampaign>(database, 'campaigns', delivery.campaignId);
  if (!campaign || campaign.status === 'cancelled') throw new Error('Esta campanha não pode mais ser executada.');
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').put({ ...campaign, status: 'scheduled', updatedAt: Date.now() });
  transaction.objectStore('deliveries').put({
    ...delivery,
    status: 'retrying',
    dueAt: Date.now(),
    attemptCount: 0,
    executionStartedAt: undefined,
    executionAcknowledgedAt: undefined,
    executionId: undefined,
    lastError: undefined,
    lastFailureTransient: undefined,
  } satisfies ScheduledDelivery);
  await waitForTransaction(transaction);
};

export const recoverLegacyTransientDeliveries = async (): Promise<void> => {
  const database = await openLibrary();
  const [campaigns, deliveries] = await Promise.all([
    getAllItems<ScheduledCampaign>(database, 'campaigns'),
    getAllItems<ScheduledDelivery>(database, 'deliveries'),
  ]);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const recoverable = deliveries.filter((delivery) => {
    if (!['error', 'retrying'].includes(delivery.status) || delivery.lastFailureTransient === true) return false;
    const campaign = campaignById.get(delivery.campaignId);
    return Boolean(
      campaign
      && campaign.status !== 'cancelled'
      && campaign.status !== 'paused'
      && isTransientScheduleError(delivery.lastError),
    );
  });
  if (!recoverable.length) return;

  const recoveredCampaignIds = new Set(recoverable.map((delivery) => delivery.campaignId));
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  campaigns.forEach((campaign) => {
    if (!recoveredCampaignIds.has(campaign.id) || campaign.status === 'scheduled') return;
    transaction.objectStore('campaigns').put({ ...campaign, status: 'scheduled', updatedAt: Date.now() });
  });
  recoverable.forEach((delivery) => transaction.objectStore('deliveries').put({
    ...delivery,
    status: 'retrying',
    dueAt: Date.now(),
    attemptCount: 0,
    executionStartedAt: undefined,
    executionAcknowledgedAt: undefined,
    executionId: undefined,
    lastFailureTransient: true,
  } satisfies ScheduledDelivery));
  await waitForTransaction(transaction);
};

export const recoverStaleDeliveries = async (): Promise<void> => {
  const database = await openLibrary();
  const deliveries = await getAllItems<ScheduledDelivery>(database, 'deliveries');
  const stale = deliveries.filter((delivery) => {
    if (delivery.status !== 'processing') return false;
    const timeout = delivery.executionAcknowledgedAt
      ? processingTimeoutMs
      : unacknowledgedExecutionTimeoutMs;
    return (delivery.executionStartedAt || 0) + timeout <= Date.now();
  });
  if (!stale.length) return;
  const transaction = database.transaction('deliveries', 'readwrite');
  stale.forEach((delivery) => transaction.objectStore('deliveries').put({
    ...delivery,
    status: 'retrying',
    dueAt: Date.now(),
    attemptCount: Math.max(0, delivery.attemptCount - 1),
    executionStartedAt: undefined,
    executionAcknowledgedAt: undefined,
    executionId: undefined,
    lastError: delivery.executionAcknowledgedAt
      ? 'O WhatsApp não confirmou o envio. Tentaremos novamente.'
      : 'O executor do WhatsApp não confirmou o recebimento do envio. Tentaremos novamente.',
    lastFailureTransient: true,
  } satisfies ScheduledDelivery));
  await waitForTransaction(transaction);
};

export const getNextAlarmTime = async (canRun: CampaignFilter = runAll): Promise<number | undefined> => {
  const database = await openLibrary();
  const [deliveries, campaigns] = await Promise.all([
    getAllItems<ScheduledDelivery>(database, 'deliveries'),
    getAllItems<ScheduledCampaign>(database, 'campaigns'),
  ]);
  const activeCampaignIds = new Set(campaigns.filter((campaign) => campaign.status === 'scheduled' && canRun(campaign)).map((campaign) => campaign.id));
  const times = deliveries.flatMap((delivery) => {
    if (!activeCampaignIds.has(delivery.campaignId)) return [];
    if (delivery.status === 'pending' || delivery.status === 'retrying') return [delivery.dueAt];
    if (delivery.status === 'processing') {
      const timeout = delivery.executionAcknowledgedAt
        ? processingTimeoutMs
        : unacknowledgedExecutionTimeoutMs;
      return [(delivery.executionStartedAt || Date.now()) + timeout];
    }
    return [];
  });
  return times.length ? Math.min(...times) : undefined;
};

export const claimNextDueDelivery = async (canRun: CampaignFilter = runAll): Promise<{ campaign: ScheduledCampaign; delivery: ScheduledDelivery } | undefined> => {
  const database = await openLibrary();
  const deliveries = await getAllItems<ScheduledDelivery>(database, 'deliveries');
  const now = Date.now();
  const dueDeliveries = deliveries
    .filter((item) => (item.status === 'pending' || item.status === 'retrying') && item.dueAt <= now)
    .sort((first, second) => first.dueAt - second.dueAt);

  let selected: { campaign: ScheduledCampaign; delivery: ScheduledDelivery } | undefined;
  const deferred: ScheduledDelivery[] = [];
  for (const delivery of dueDeliveries) {
    const campaign = await getItem<ScheduledCampaign>(database, 'campaigns', delivery.campaignId);
    if (campaign?.status !== 'scheduled' || !canRun(campaign)) continue;
    if (isRemarketingCampaign(campaign)) {
      const nextAllowedAt = getRemarketingDeferral({
        campaign,
        delivery,
        campaignDeliveries: deliveries.filter((item) => item.campaignId === campaign.id),
        now,
      });
      if (nextAllowedAt !== undefined) {
        deferred.push({ ...delivery, dueAt: nextAllowedAt });
        continue;
      }
    }
    selected = { campaign, delivery };
    break;
  }
  if (deferred.length) {
    const transaction = database.transaction('deliveries', 'readwrite');
    deferred.forEach((delivery) => transaction.objectStore('deliveries').put(delivery));
    await waitForTransaction(transaction);
  }
  if (!selected) return undefined;

  const claimed = {
    ...selected.delivery,
    status: 'processing',
    executionStartedAt: Date.now(),
    executionAcknowledgedAt: undefined,
    executionId: crypto.randomUUID(),
    attemptCount: selected.delivery.attemptCount + 1,
    lastError: undefined,
    lastFailureTransient: undefined,
  } satisfies ScheduledDelivery;
  const transaction = database.transaction('deliveries', 'readwrite');
  transaction.objectStore('deliveries').put(claimed);
  await waitForTransaction(transaction);
  return { campaign: selected.campaign, delivery: claimed };
};

export const prepareDeliveryAttempt = async (
  deliveryId: string,
  executionId: string,
  currentStep: number,
  messageId: string,
  resolvedChatId: string,
  previousMessageId?: string,
): Promise<void> => {
  const database = await openLibrary();
  const delivery = await getItem<ScheduledDelivery>(database, 'deliveries', deliveryId);
  if (!delivery || delivery.status !== 'processing' || delivery.executionId !== executionId || delivery.currentStep !== currentStep) {
    throw new Error('Esta tentativa de envio não está mais ativa.');
  }

  if (
    delivery.messageStep === currentStep
    && delivery.messageId
    && delivery.messageId !== messageId
    && delivery.messageId !== previousMessageId
  ) {
    throw new Error('A tentativa já possui outro identificador de mensagem.');
  }

  const transaction = database.transaction('deliveries', 'readwrite');
  transaction.objectStore('deliveries').put({
    ...delivery,
    recipient: { ...delivery.recipient, chatId: resolvedChatId },
    messageId,
    messageStep: currentStep,
  } satisfies ScheduledDelivery);
  await waitForTransaction(transaction);
};

export const acknowledgeDeliveryExecution = async (deliveryId: string, executionId: string): Promise<void> => {
  const database = await openLibrary();
  const delivery = await getItem<ScheduledDelivery>(database, 'deliveries', deliveryId);
  if (!delivery || delivery.status !== 'processing' || delivery.executionId !== executionId) return;
  const transaction = database.transaction('deliveries', 'readwrite');
  transaction.objectStore('deliveries').put({
    ...delivery,
    executionAcknowledgedAt: Date.now(),
  } satisfies ScheduledDelivery);
  await waitForTransaction(transaction);
};

const completeCampaignWhenFinished = async (campaignId: string): Promise<void> => {
  const database = await openLibrary();
  const campaign = await getItem<ScheduledCampaign>(database, 'campaigns', campaignId);
  if (!campaign || campaign.status !== 'scheduled' || isRemarketingCampaign(campaign)) return;
  const deliveries = (await getAllItems<ScheduledDelivery>(database, 'deliveries')).filter((delivery) => delivery.campaignId === campaignId);
  if (!deliveries.length || deliveries.some((delivery) => !['sent', 'error', 'cancelled'].includes(delivery.status))) return;
  const transaction = database.transaction('campaigns', 'readwrite');
  transaction.objectStore('campaigns').put({ ...campaign, status: 'completed', updatedAt: Date.now() });
  await waitForTransaction(transaction);
};

export const finishDeliveryAttempt = async (
  deliveryId: string,
  executionId: string,
  ok: boolean,
  error?: string,
  resolvedChatId?: string,
  retryable = false,
): Promise<void> => {
  const database = await openLibrary();
  const delivery = await getItem<ScheduledDelivery>(database, 'deliveries', deliveryId);
  if (!delivery || delivery.status !== 'processing' || delivery.executionId !== executionId) return;
  const campaign = await getItem<ScheduledCampaign>(database, 'campaigns', delivery.campaignId);
  if (!campaign) return;

  let nextDelivery: ScheduledDelivery;
  if (!ok) {
    const failurePolicy = getScheduleFailurePolicy({
      attemptCount: delivery.attemptCount,
      campaignIsScheduled: campaign.status === 'scheduled',
      error,
      explicitlyRetryable: retryable,
      maxAttempts,
    });
    nextDelivery = {
      ...delivery,
      recipient: resolvedChatId ? { ...delivery.recipient, chatId: resolvedChatId } : delivery.recipient,
      status: delivery.exitRequestedAt !== undefined ? 'cancelled' : failurePolicy.shouldRetry ? 'retrying' : 'error',
      dueAt: failurePolicy.shouldRetry
        ? Date.now() + failurePolicy.delayMs
        : delivery.dueAt,
      attemptCount: failurePolicy.attemptCount,
      executionStartedAt: undefined,
      executionAcknowledgedAt: undefined,
      executionId: undefined,
      lastError: error || 'O WhatsApp não conseguiu concluir este envio.',
      lastFailureTransient: failurePolicy.transient,
    };
  } else {
    const nextStep = delivery.currentStep + 1;
    const isFinished = nextStep >= delivery.totalSteps || !campaign.steps[nextStep];
    // Remarketing: o contato respondeu enquanto a etapa era enviada; ela conta, mas o fluxo para aqui.
    const hasExited = !isFinished && delivery.exitRequestedAt !== undefined;
    nextDelivery = {
      ...delivery,
      recipient: resolvedChatId ? { ...delivery.recipient, chatId: resolvedChatId } : delivery.recipient,
      status: isFinished ? 'sent' : hasExited ? 'cancelled' : 'pending',
      currentStep: nextStep,
      lastStepSentAt: Date.now(),
      dueAt: isFinished || hasExited ? delivery.dueAt : Date.now() + Math.max(0, campaign.steps[nextStep].delaySeconds) * 1000,
      executionStartedAt: undefined,
      executionAcknowledgedAt: undefined,
      executionId: undefined,
      sentAt: isFinished ? Date.now() : undefined,
      lastError: undefined,
      lastFailureTransient: undefined,
      attemptCount: isFinished ? delivery.attemptCount : 0,
      messageId: isFinished ? delivery.messageId : undefined,
      messageStep: isFinished ? delivery.messageStep : undefined,
    };
  }

  const transaction = database.transaction('deliveries', 'readwrite');
  transaction.objectStore('deliveries').put(nextDelivery);
  await waitForTransaction(transaction);
  await completeCampaignWhenFinished(delivery.campaignId);
};

export const returnDeliveryToRetry = async (deliveryId: string, executionId: string, error: string, retryable = false): Promise<void> => {
  await finishDeliveryAttempt(deliveryId, executionId, false, error, undefined, retryable);
};
