import type {
  EnrollmentSource,
  KnownContact,
  ScheduledCampaign,
  ScheduledDelivery,
} from '../types';
import { startOfLocalDay } from './automation-rules';

// Regras puras do remarketing: quem pode entrar, quando cada etapa pode sair e quem sai do fluxo.

export const activeDeliveryStatuses: ScheduledDelivery['status'][] = ['pending', 'processing', 'retrying', 'paused'];

export const isRemarketingCampaign = (campaign?: Pick<ScheduledCampaign, 'kind'>): boolean => campaign?.kind === 'remarketing';

export const isGroupChatId = (chatId: string): boolean => chatId.endsWith('@g.us');

export const isActiveDelivery = (delivery: ScheduledDelivery): boolean => activeDeliveryStatuses.includes(delivery.status);

// Identificadores que representam o mesmo contato: o capturado na inscrição, o resolvido no envio e o telefone.
export const getDeliveryChatKeys = (delivery: ScheduledDelivery): Set<string> => {
  const keys = new Set<string>([delivery.recipient.chatId]);
  if (delivery.enrolledChatId) keys.add(delivery.enrolledChatId);
  const phone = delivery.recipient.phone.replace(/\D/g, '');
  if (phone) keys.add(`${phone}@c.us`);
  return keys;
};

export const getMessageChatKeys = (chatId: string, phone: string): string[] => {
  const digits = phone.replace(/\D/g, '');
  return digits ? [chatId, `${digits}@c.us`] : [chatId];
};

const deliveryMatchesChat = (delivery: ScheduledDelivery, chatKeys: string[]): boolean => {
  const keys = getDeliveryChatKeys(delivery);
  return chatKeys.some((key) => keys.has(key));
};

export type EnrollmentPlan = {
  deliveries: ScheduledDelivery[];
  skipped: Array<{ name: string; reason: string }>;
};

export const planEnrollments = ({
  campaign,
  chatIds,
  contacts,
  existingDeliveries,
  source,
  now,
  createId = () => crypto.randomUUID(),
}: {
  campaign: ScheduledCampaign;
  chatIds: string[];
  contacts: KnownContact[];
  existingDeliveries: ScheduledDelivery[];
  source: EnrollmentSource;
  now: number;
  createId?: () => string;
}): EnrollmentPlan => {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const activeInFlow = existingDeliveries.filter((delivery) => delivery.campaignId === campaign.id && isActiveDelivery(delivery));
  const deliveries: ScheduledDelivery[] = [];
  const skipped: EnrollmentPlan['skipped'] = [];
  const firstDelaySeconds = Math.max(0, campaign.steps[0]?.delaySeconds ?? 0);

  [...new Set(chatIds)].forEach((chatId) => {
    const contact = contactById.get(chatId);
    const name = contact?.name || chatId;
    if (isGroupChatId(chatId)) {
      skipped.push({ name, reason: 'Grupos não entram em fluxos de remarketing.' });
      return;
    }
    if (!contact || !contact.lastInboundAt) {
      skipped.push({ name, reason: 'Só entram contatos que já enviaram mensagem para você.' });
      return;
    }
    const chatKeys = getMessageChatKeys(contact.id, contact.phone);
    if ([...activeInFlow, ...deliveries].some((delivery) => deliveryMatchesChat(delivery, chatKeys))) {
      skipped.push({ name, reason: 'Já está neste fluxo.' });
      return;
    }
    const dueAt = now + firstDelaySeconds * 1000;
    deliveries.push({
      id: createId(),
      campaignId: campaign.id,
      recipient: { id: createId(), name, phone: contact.phone, chatId: contact.id },
      scheduledAt: dueAt,
      dueAt,
      status: campaign.status === 'scheduled' ? 'pending' : 'paused',
      currentStep: 0,
      totalSteps: campaign.steps.length,
      attemptCount: 0,
      enrolledAt: now,
      enrolledChatId: contact.id,
      enrollmentSource: source,
    });
  });

  return { deliveries, skipped };
};

// Inscrições que devem sair porque o contato respondeu depois de entrar no fluxo.
export const selectDeliveriesToExit = ({
  deliveries,
  campaigns,
  chatKeys,
  messageAt,
}: {
  deliveries: ScheduledDelivery[];
  campaigns: ScheduledCampaign[];
  chatKeys: string[];
  messageAt: number;
}): ScheduledDelivery[] => {
  const remarketingIds = new Set(campaigns.filter(isRemarketingCampaign).map((campaign) => campaign.id));
  return deliveries.filter((delivery) => remarketingIds.has(delivery.campaignId)
    && isActiveDelivery(delivery)
    && !delivery.exitRequestedAt
    && (delivery.enrolledAt ?? delivery.scheduledAt) < messageAt
    && deliveryMatchesChat(delivery, chatKeys));
};

// Marca a saída: entregas paradas são canceladas; a que está sendo enviada termina a etapa atual e para.
export const applyEnrollmentExit = (delivery: ScheduledDelivery, now: number): ScheduledDelivery => {
  if (delivery.status === 'processing') return { ...delivery, exitRequestedAt: now, exitReason: 'replied' };
  return {
    ...delivery,
    status: 'cancelled',
    exitRequestedAt: now,
    exitReason: 'replied',
    executionStartedAt: undefined,
    executionAcknowledgedAt: undefined,
    executionId: undefined,
  };
};

const getLastActivityAt = (delivery: ScheduledDelivery): number | undefined => (
  delivery.status === 'processing' ? delivery.executionStartedAt ?? delivery.lastStepSentAt : delivery.lastStepSentAt
);

// Limite diário de pessoas e intervalo entre pessoas, aplicados quando a etapa vence.
// Devolve o próximo horário permitido ou `undefined` se a etapa pode sair agora.
export const getRemarketingDeferral = ({
  campaign,
  delivery,
  campaignDeliveries,
  now,
}: {
  campaign: Pick<ScheduledCampaign, 'dailyLimit' | 'intervalMinutes'>;
  delivery: ScheduledDelivery;
  campaignDeliveries: ScheduledDelivery[];
  now: number;
}): number | undefined => {
  const others = campaignDeliveries.filter((item) => item.id !== delivery.id);
  const dayStart = startOfLocalDay(now);
  const alreadyContactedToday = (delivery.lastStepSentAt ?? 0) >= dayStart;

  if (!alreadyContactedToday) {
    const peopleToday = others.filter((item) => (getLastActivityAt(item) ?? 0) >= dayStart).length;
    if (peopleToday >= Math.max(1, campaign.dailyLimit)) {
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay.getTime();
    }
  }

  const lastOtherSend = Math.max(0, ...others.map((item) => getLastActivityAt(item) ?? 0));
  const nextAllowed = lastOtherSend + Math.max(1, campaign.intervalMinutes) * 60_000;
  return lastOtherSend && nextAllowed > now ? nextAllowed : undefined;
};

// Ao editar um fluxo, as inscrições em andamento seguem as novas etapas.
export const adaptDeliveryToFlow = (delivery: ScheduledDelivery, totalSteps: number, now: number): ScheduledDelivery => {
  if (!isActiveDelivery(delivery) || delivery.status === 'processing') return { ...delivery, totalSteps: Math.max(totalSteps, delivery.currentStep + 1) };
  if (delivery.currentStep >= totalSteps) return { ...delivery, totalSteps, status: 'sent', sentAt: delivery.lastStepSentAt ?? now };
  return { ...delivery, totalSteps };
};
