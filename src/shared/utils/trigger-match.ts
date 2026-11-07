import type { AutomationTrigger, TriggerMatchMode } from '../types';

// Correspondência de palavras-chave dos gatilhos (SPEC, "Gatilhos e remarketing").

export const normalizeTriggerText = (value: string): string => value
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export const parseKeywords = (value: string): string[] => {
  const keywords = value.split(/[,\n]/).map((keyword) => keyword.trim()).filter(Boolean);
  return [...new Map(keywords.map((keyword) => [normalizeTriggerText(keyword), keyword])).entries()]
    .filter(([normalized]) => normalized)
    .map(([, keyword]) => keyword);
};

export const matchesKeyword = (text: string, keyword: string, mode: TriggerMatchMode): boolean => {
  const normalizedText = normalizeTriggerText(text);
  const normalizedKeyword = normalizeTriggerText(keyword);
  if (!normalizedText || !normalizedKeyword) return false;
  if (mode === 'exact') return normalizedText === normalizedKeyword;
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
};

export const triggerMatches = (trigger: AutomationTrigger, text: string): boolean => (
  trigger.keywords.some((keyword) => matchesKeyword(text, keyword, trigger.matchMode))
);

// Uma mensagem dispara no máximo um gatilho: o mais antigo entre os ligados que corresponderem.
export const findMatchingTrigger = (
  triggers: AutomationTrigger[],
  message: { text: string; isGroup: boolean },
): AutomationTrigger | undefined => [...triggers]
  .sort((first, second) => first.createdAt - second.createdAt)
  .find((trigger) => trigger.enabled
    && (!message.isGroup || trigger.allowGroups)
    && triggerMatches(trigger, message.text));
