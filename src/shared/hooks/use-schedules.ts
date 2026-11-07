import { useCallback, useEffect, useState } from 'react';
import { getScheduleSnapshot } from '../services/schedule-service';
import type { ScheduleCommand, ScheduledCampaign, ScheduledDelivery } from '../types';

type RuntimeResponse = { ok: boolean; error?: string };

export type ScheduleState = {
  campaigns: ScheduledCampaign[];
  deliveries: ScheduledDelivery[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  runCommand: (command: ScheduleCommand) => Promise<void>;
};

export const useSchedules = (): ScheduleState => {
  const [campaigns, setCampaigns] = useState<ScheduledCampaign[]>([]);
  const [deliveries, setDeliveries] = useState<ScheduledDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await getScheduleSnapshot();
      setCampaigns(snapshot.campaigns);
      setDeliveries(snapshot.deliveries);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Não foi possível carregar os agendamentos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runCommand = useCallback(async (command: ScheduleCommand): Promise<void> => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Abra esta tela pela extensão para alterar agendamentos.');
    }
    const response = await chrome.runtime.sendMessage(command) as RuntimeResponse;
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível atualizar o agendamento.');
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const handleStateChange = (message: { type?: string }): void => {
      if (message.type === 'SCHEDULE_STATE_CHANGED') void refresh();
    };
    const runtimeMessages = typeof chrome !== 'undefined' ? chrome.runtime?.onMessage : undefined;
    runtimeMessages?.addListener(handleStateChange);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15_000);
    return () => {
      runtimeMessages?.removeListener(handleStateChange);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { campaigns, deliveries, isLoading, error, refresh, runCommand };
};
