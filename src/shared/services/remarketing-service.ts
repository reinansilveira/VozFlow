import type {
  EnrollmentResult,
  EnrollmentSource,
  KnownContact,
  ScheduledCampaign,
  ScheduledDelivery,
} from '../types';
import {
  adaptDeliveryToFlow,
  applyEnrollmentExit,
  isActiveDelivery,
  isRemarketingCampaign,
  planEnrollments,
  selectDeliveriesToExit,
} from '../utils/remarketing';
import { getAllItems, getItem, openLibrary } from './library-service';
import { pauseSchedule, resumeSchedule } from './schedule-service';

// Fluxos de remarketing: campanhas `remarketing` na mesma fila dos agendamentos, uma entrega por inscrição.

const waitForTransaction = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('A alteração do fluxo foi interrompida.'));
});

const getFlow = async (database: IDBDatabase, flowId: string): Promise<ScheduledCampaign> => {
  const flow = await getItem<ScheduledCampaign>(database, 'campaigns', flowId);
  if (!flow || !isRemarketingCampaign(flow)) throw new Error('Fluxo de remarketing não encontrado.');
  return flow;
};

export const saveRemarketingFlow = async (flow: ScheduledCampaign): Promise<void> => {
  if (!isRemarketingCampaign(flow)) throw new Error('O fluxo precisa ser do tipo remarketing.');
  if (!flow.steps.length) throw new Error('Adicione pelo menos uma etapa ao fluxo.');
  const database = await openLibrary();
  const existing = await getItem<ScheduledCampaign>(database, 'campaigns', flow.id);
  if (existing && !isRemarketingCampaign(existing)) throw new Error('Este identificador pertence a um agendamento.');
  const deliveries = existing
    ? (await getAllItems<ScheduledDelivery>(database, 'deliveries')).filter((delivery) => delivery.campaignId === flow.id)
    : [];
  const now = Date.now();
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').put({
    ...flow,
    status: existing?.status ?? flow.status,
    createdAt: existing?.createdAt ?? flow.createdAt,
    recipientCount: deliveries.length,
    updatedAt: now,
  } satisfies ScheduledCampaign);
  deliveries.forEach((delivery) => transaction.objectStore('deliveries').put(adaptDeliveryToFlow(delivery, flow.steps.length, now)));
  await waitForTransaction(transaction);
};

export const setRemarketingFlowEnabled = async (flowId: string, enabled: boolean): Promise<void> => {
  await getFlow(await openLibrary(), flowId);
  await (enabled ? resumeSchedule(flowId) : pauseSchedule(flowId));
};

export const deleteRemarketingFlow = async (flowId: string): Promise<void> => {
  const database = await openLibrary();
  await getFlow(database, flowId);
  const deliveries = (await getAllItems<ScheduledDelivery>(database, 'deliveries')).filter((delivery) => delivery.campaignId === flowId);
  if (deliveries.some((delivery) => delivery.status === 'processing')) {
    throw new Error('Uma mensagem deste fluxo está sendo enviada agora. Tente excluir em instantes.');
  }
  const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
  transaction.objectStore('campaigns').delete(flowId);
  deliveries.forEach((delivery) => transaction.objectStore('deliveries').delete(delivery.id));
  await waitForTransaction(transaction);
};

export const enrollInRemarketingFlow = async (
  flowId: string,
  chatIds: string[],
  source: EnrollmentSource,
): Promise<EnrollmentResult> => {
  const database = await openLibrary();
  const flow = await getFlow(database, flowId);
  const [contacts, deliveries] = await Promise.all([
    getAllItems<KnownContact>(database, 'contacts'),
    getAllItems<ScheduledDelivery>(database, 'deliveries'),
  ]);
  const plan = planEnrollments({ campaign: flow, chatIds, contacts, existingDeliveries: deliveries, source, now: Date.now() });
  if (plan.deliveries.length) {
    const transaction = database.transaction(['campaigns', 'deliveries'], 'readwrite');
    plan.deliveries.forEach((delivery) => transaction.objectStore('deliveries').add(delivery));
    transaction.objectStore('campaigns').put({
      ...flow,
      recipientCount: deliveries.filter((delivery) => delivery.campaignId === flowId).length + plan.deliveries.length,
      updatedAt: Date.now(),
    } satisfies ScheduledCampaign);
    await waitForTransaction(transaction);
  }
  return { enrolled: plan.deliveries.length, skipped: plan.skipped };
};

export const cancelEnrollment = async (deliveryId: string): Promise<void> => {
  const database = await openLibrary();
  const delivery = await getItem<ScheduledDelivery>(database, 'deliveries', deliveryId);
  if (!delivery) throw new Error('Inscrição não encontrada.');
  await getFlow(database, delivery.campaignId);
  if (!isActiveDelivery(delivery)) return;
  const now = Date.now();
  const transaction = database.transaction('deliveries', 'readwrite');
  transaction.objectStore('deliveries').put(delivery.status === 'processing'
    ? { ...delivery, exitRequestedAt: now, exitReason: 'cancelled' }
    : { ...delivery, status: 'cancelled', exitRequestedAt: now, exitReason: 'cancelled' } satisfies ScheduledDelivery);
  await waitForTransaction(transaction);
};

// O contato respondeu: sai de todos os fluxos em que entrou antes desta mensagem.
export const exitFlowsForMessage = async (chatKeys: string[], messageAt: number): Promise<number> => {
  const database = await openLibrary();
  const [campaigns, deliveries] = await Promise.all([
    getAllItems<ScheduledCampaign>(database, 'campaigns'),
    getAllItems<ScheduledDelivery>(database, 'deliveries'),
  ]);
  const exiting = selectDeliveriesToExit({ deliveries, campaigns, chatKeys, messageAt });
  if (!exiting.length) return 0;
  const now = Date.now();
  const transaction = database.transaction('deliveries', 'readwrite');
  exiting.forEach((delivery) => transaction.objectStore('deliveries').put(applyEnrollmentExit(delivery, now)));
  await waitForTransaction(transaction);
  return exiting.length;
};
