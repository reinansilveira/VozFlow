import type { AutomationSettings, AutomationTrigger, LicenseSnapshot, TriggerFiring } from '../types';

// Regras puras de segurança da automação: plano, limites e deduplicação dos gatilhos.

export const automationStorageKey = 'vozflow.automation';
export const hourMs = 60 * 60 * 1000;
export const firingRetentionMs = 31 * 24 * hourMs;

export const defaultAutomationSettings: AutomationSettings = {
  paused: false,
  triggerDailyLimit: 50,
};

export const automationLimits = {
  triggerDailyLimit: { min: 1, max: 500 },
  cooldownHours: { min: 1, max: 720 },
  replyDelaySeconds: { min: 0, max: 120 },
  flowDailyLimit: { min: 1, max: 100 },
  flowIntervalMinutes: { min: 1, max: 180 },
} as const;

export const clampNumber = (value: number, limits: { min: number; max: number }): number => (
  Math.min(limits.max, Math.max(limits.min, Math.floor(Number.isFinite(value) ? value : limits.min)))
);

export const normalizeAutomationSettings = (value: Partial<AutomationSettings> | undefined): AutomationSettings => ({
  paused: value?.paused === true,
  triggerDailyLimit: clampNumber(value?.triggerDailyLimit ?? defaultAutomationSettings.triggerDailyLimit, automationLimits.triggerDailyLimit),
});

// O teste grátis libera tudo; nas licenças pagas, só planos com "Pro" no nome.
export const hasAutomationPlan = (snapshot: Pick<LicenseSnapshot, 'state' | 'plan'> | null): boolean => {
  if (!snapshot) return false;
  if (snapshot.state === 'teste_ativo') return true;
  return snapshot.state === 'licenca_ativa' && /\bpro\b/i.test(snapshot.plan || '');
};

export const startOfLocalDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export type TriggerFiringDecision =
  | { allowed: true }
  | { allowed: false; reason: 'paused' | 'cooldown' | 'daily_limit' };

export const evaluateTriggerFiring = ({
  trigger,
  chatId,
  firings,
  settings,
  now,
}: {
  trigger: Pick<AutomationTrigger, 'id' | 'cooldownHours'>;
  chatId: string;
  firings: TriggerFiring[];
  settings: AutomationSettings;
  now: number;
}): TriggerFiringDecision => {
  if (settings.paused) return { allowed: false, reason: 'paused' };
  const cooldownMs = clampNumber(trigger.cooldownHours, automationLimits.cooldownHours) * hourMs;
  const firedRecently = firings.some((firing) => firing.triggerId === trigger.id
    && firing.chatId === chatId
    && now - firing.firedAt < cooldownMs);
  if (firedRecently) return { allowed: false, reason: 'cooldown' };
  const dayStart = startOfLocalDay(now);
  const firedToday = firings.filter((firing) => firing.firedAt >= dayStart).length;
  if (firedToday >= settings.triggerDailyLimit) return { allowed: false, reason: 'daily_limit' };
  return { allowed: true };
};

export const triggerDecisionMessage: Record<Exclude<TriggerFiringDecision, { allowed: true }>['reason'], string> = {
  paused: 'Automação pausada.',
  cooldown: 'Este contato já recebeu este gatilho dentro do período sem repetição.',
  daily_limit: 'Limite diário de disparos de gatilhos atingido. Os disparos voltam amanhã.',
};
