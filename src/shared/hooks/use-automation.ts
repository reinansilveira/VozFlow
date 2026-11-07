import { useCallback, useEffect, useState } from 'react';
import { getAutomationSettings, getKnownContacts, getTriggerFirings, getTriggers } from '../services/automation-service';
import { openLibrary, getAllItems } from '../services/library-service';
import type {
  AutomationCommand,
  AutomationSettings,
  AutomationTrigger,
  KnownContact,
  ScheduledCampaign,
  ScheduledDelivery,
} from '../types';
import { automationStorageKey, defaultAutomationSettings, startOfLocalDay } from '../utils/automation-rules';
import { isRemarketingCampaign } from '../utils/remarketing';

type RuntimeResponse<T> = { ok: boolean; error?: string; result?: T };

export type AutomationState = {
  triggers: AutomationTrigger[];
  flows: ScheduledCampaign[];
  enrollments: ScheduledDelivery[];
  contacts: KnownContact[];
  settings: AutomationSettings;
  firedToday: number;
  isLoading: boolean;
  error: string | null;
  runCommand: <T = unknown>(command: AutomationCommand) => Promise<T | undefined>;
};

export const useAutomation = (): AutomationState => {
  const [triggers, setTriggers] = useState<AutomationTrigger[]>([]);
  const [flows, setFlows] = useState<ScheduledCampaign[]>([]);
  const [enrollments, setEnrollments] = useState<ScheduledDelivery[]>([]);
  const [contacts, setContacts] = useState<KnownContact[]>([]);
  const [settings, setSettings] = useState<AutomationSettings>(defaultAutomationSettings);
  const [firedToday, setFiredToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const database = await openLibrary();
      const [nextTriggers, campaigns, deliveries, nextContacts, firings, nextSettings] = await Promise.all([
        getTriggers(database),
        getAllItems<ScheduledCampaign>(database, 'campaigns'),
        getAllItems<ScheduledDelivery>(database, 'deliveries'),
        getKnownContacts(database),
        getTriggerFirings(database),
        getAutomationSettings(),
      ]);
      const nextFlows = campaigns.filter(isRemarketingCampaign).sort((first, second) => second.createdAt - first.createdAt);
      const flowIds = new Set(nextFlows.map((flow) => flow.id));
      const dayStart = startOfLocalDay(Date.now());
      setTriggers(nextTriggers);
      setFlows(nextFlows);
      setEnrollments(deliveries.filter((delivery) => flowIds.has(delivery.campaignId)).sort((first, second) => (second.enrolledAt ?? 0) - (first.enrolledAt ?? 0)));
      setContacts(nextContacts);
      setFiredToday(firings.filter((firing) => firing.firedAt >= dayStart).length);
      setSettings(nextSettings);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Não foi possível carregar a automação.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runCommand = useCallback(async <T = unknown>(command: AutomationCommand): Promise<T | undefined> => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Abra esta tela pela extensão para alterar a automação.');
    }
    const response = await chrome.runtime.sendMessage(command) as RuntimeResponse<T>;
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível atualizar a automação.');
    await refresh();
    return response.result;
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const handleStateChange = (message: { type?: string }): void => {
      if (message.type === 'SCHEDULE_STATE_CHANGED') void refresh();
    };
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area === 'local' && changes[automationStorageKey]) void refresh();
    };
    const hasChrome = typeof chrome !== 'undefined';
    hasChrome && chrome.runtime?.onMessage?.addListener(handleStateChange);
    hasChrome && chrome.storage?.onChanged?.addListener(handleStorageChange);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15_000);
    return () => {
      hasChrome && chrome.runtime?.onMessage?.removeListener(handleStateChange);
      hasChrome && chrome.storage?.onChanged?.removeListener(handleStorageChange);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { triggers, flows, enrollments, contacts, settings, firedToday, isLoading, error, runCommand };
};
