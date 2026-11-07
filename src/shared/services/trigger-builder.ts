import type { AutomationTrigger, ScheduleStep } from '../types';
import { automationLimits, clampNumber } from '../utils/automation-rules';
import { buildStepsFromSources, type ScheduleLibrary } from './schedule-builder';

// Monta as etapas da ação do gatilho (áudio ou funil) a partir da biblioteca atual.
export const buildTriggerSteps = (trigger: AutomationTrigger, library: ScheduleLibrary): ScheduleStep[] => {
  const replyDelaySeconds = clampNumber(trigger.replyDelaySeconds, automationLimits.replyDelaySeconds);
  const steps = trigger.action.type === 'audio'
    ? buildStepsFromSources([{ type: 'audio', contentId: trigger.action.contentId, delaySeconds: 0 }], library, `do gatilho “${trigger.name}”`)
    : (() => {
      const funnel = library.funnels.find((item) => item.id === trigger.action.contentId);
      if (!funnel) throw new Error(`O funil do gatilho “${trigger.name}” não existe mais.`);
      return buildStepsFromSources(funnel.steps, library, `do funil “${funnel.name}”`);
    })();
  if (!steps.length) throw new Error(`A ação do gatilho “${trigger.name}” não possui etapas.`);
  return steps.map((step, index) => index === 0 ? { ...step, delaySeconds: Math.max(0, step.delaySeconds) + replyDelaySeconds } : step);
};
