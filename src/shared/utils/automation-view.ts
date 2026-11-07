import type { EnrollmentExitReason, FunnelStep, KnownContact, ScheduledDelivery } from '../types';
import { isActiveDelivery } from './remarketing';

// Funções puras usadas pelas telas de automação, fora do JSX.

export type DelayUnit = 'minutes' | 'hours' | 'days';

export const delayUnitSeconds: Record<DelayUnit, number> = { minutes: 60, hours: 3_600, days: 86_400 };

export const delayUnitLabel: Record<DelayUnit, string> = { minutes: 'minutos', hours: 'horas', days: 'dias' };

export const toDelayParts = (seconds: number): { value: number; unit: DelayUnit } => {
  if (seconds > 0 && seconds % delayUnitSeconds.days === 0) return { value: seconds / delayUnitSeconds.days, unit: 'days' };
  if (seconds > 0 && seconds % delayUnitSeconds.hours === 0) return { value: seconds / delayUnitSeconds.hours, unit: 'hours' };
  return { value: Math.max(0, Math.round(seconds / delayUnitSeconds.minutes)), unit: 'minutes' };
};

export const fromDelayParts = (value: number, unit: DelayUnit): number => Math.max(0, Math.floor(value || 0)) * delayUnitSeconds[unit];

export const formatDelay = (seconds: number): string => {
  const { value, unit } = toDelayParts(seconds);
  return value === 0 ? 'na hora' : `${value} ${delayUnitLabel[unit]}`;
};

export const filterReactivationContacts = (
  contacts: KnownContact[],
  { tag, inactiveDays, now }: { tag: string; inactiveDays: number; now: number },
): KnownContact[] => {
  const limit = now - Math.max(0, inactiveDays) * delayUnitSeconds.days * 1000;
  return contacts.filter((contact) => contact.lastInboundAt <= limit && (!tag || contact.tags.includes(tag)));
};

export const collectContactTags = (contacts: KnownContact[]): string[] => (
  [...new Set(contacts.flatMap((contact) => contact.tags))].sort((first, second) => first.localeCompare(second, 'pt-BR'))
);

export type EnrollmentSummary = { active: number; finished: number; exited: number; failed: number };

export const summarizeEnrollments = (deliveries: ScheduledDelivery[]): EnrollmentSummary => ({
  active: deliveries.filter(isActiveDelivery).length,
  finished: deliveries.filter((delivery) => delivery.status === 'sent').length,
  exited: deliveries.filter((delivery) => delivery.status === 'cancelled').length,
  failed: deliveries.filter((delivery) => delivery.status === 'error').length,
});

const exitLabel: Record<EnrollmentExitReason, string> = { replied: 'Saiu: respondeu', cancelled: 'Cancelado' };

export const getEnrollmentLabel = (delivery: ScheduledDelivery): string => {
  if (delivery.exitReason && (delivery.status === 'cancelled' || delivery.exitRequestedAt)) return exitLabel[delivery.exitReason];
  if (delivery.status === 'sent') return 'Concluído';
  if (delivery.status === 'error') return 'Erro';
  if (delivery.status === 'paused') return 'Pausado';
  if (delivery.status === 'processing') return 'Enviando';
  return `Etapa ${Math.min(delivery.currentStep + 1, delivery.totalSteps)}/${delivery.totalSteps}`;
};

export const validateFlowSources = (sources: FunnelStep[]): string | undefined => {
  if (!sources.length) return 'Adicione pelo menos uma etapa ao fluxo.';
  if (sources.some((step) => step.type === 'text' && !step.text?.trim())) return 'Preencha o texto de cada etapa.';
  if (sources.some((step) => step.type !== 'text' && !step.contentId)) return 'Escolha o conteúdo de cada etapa.';
  return undefined;
};
