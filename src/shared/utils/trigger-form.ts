import type { AutomationTrigger, TriggerAction, TriggerMatchMode } from '../types';
import { automationLimits, clampNumber } from './automation-rules';
import { parseKeywords } from './trigger-match';

export type TriggerForm = {
  name: string;
  keywords: string;
  matchMode: TriggerMatchMode;
  actionType: TriggerAction['type'];
  contentId: string;
  replyDelaySeconds: number;
  cooldownHours: number;
  allowGroups: boolean;
  tag: string;
  remarketingFlowId: string;
};

export const createEmptyTriggerForm = (): TriggerForm => ({
  name: '',
  keywords: '',
  matchMode: 'contains',
  actionType: 'audio',
  contentId: '',
  replyDelaySeconds: 5,
  cooldownHours: 24,
  allowGroups: false,
  tag: '',
  remarketingFlowId: '',
});

export const triggerToForm = (trigger: AutomationTrigger): TriggerForm => ({
  name: trigger.name,
  keywords: trigger.keywords.join(', '),
  matchMode: trigger.matchMode,
  actionType: trigger.action.type,
  contentId: trigger.action.contentId,
  replyDelaySeconds: trigger.replyDelaySeconds,
  cooldownHours: trigger.cooldownHours,
  allowGroups: trigger.allowGroups,
  tag: trigger.tag || '',
  remarketingFlowId: trigger.remarketingFlowId || '',
});

const isWithin = (value: number, limits: { min: number; max: number }): boolean => Number.isFinite(value) && value >= limits.min && value <= limits.max;

export const buildTriggerFromForm = (
  form: TriggerForm,
  existing: AutomationTrigger | undefined,
  now: number,
): { trigger: AutomationTrigger; error?: undefined } | { trigger?: undefined; error: string } => {
  const keywords = parseKeywords(form.keywords);
  if (!form.name.trim()) return { error: 'Dê um nome ao gatilho.' };
  if (!keywords.length) return { error: 'Informe pelo menos uma palavra-chave.' };
  if (!form.contentId) return { error: form.actionType === 'audio' ? 'Escolha o áudio que será enviado.' : 'Escolha o funil que será iniciado.' };
  if (!isWithin(form.replyDelaySeconds, automationLimits.replyDelaySeconds)) return { error: 'O atraso da resposta deve ficar entre 0 e 120 segundos.' };
  if (!isWithin(form.cooldownHours, automationLimits.cooldownHours)) return { error: 'O período sem repetição deve ficar entre 1 e 720 horas.' };
  return {
    trigger: {
      id: existing?.id || crypto.randomUUID(),
      name: form.name.trim(),
      keywords,
      matchMode: form.matchMode,
      action: { type: form.actionType, contentId: form.contentId },
      enabled: existing?.enabled ?? true,
      replyDelaySeconds: clampNumber(form.replyDelaySeconds, automationLimits.replyDelaySeconds),
      cooldownHours: clampNumber(form.cooldownHours, automationLimits.cooldownHours),
      allowGroups: form.allowGroups,
      ...(form.tag.trim() ? { tag: form.tag.trim() } : {}),
      ...(form.remarketingFlowId ? { remarketingFlowId: form.remarketingFlowId } : {}),
      fireCount: existing?.fireCount ?? 0,
      lastFiredAt: existing?.lastFiredAt,
      lastError: existing?.lastError,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };
};
