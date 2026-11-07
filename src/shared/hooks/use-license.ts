import { useCallback, useEffect, useState } from 'react';
import { hasSendAccess, licenseStorageKey, type LicenseRequestResult } from '../services/license-service';
import type { LicenseCommand, LicenseLocalState, LicenseSnapshot } from '../types';
import { licenseCopy } from '../utils/license-copy';

type RuntimeResponse = { ok: boolean; error?: string; result?: LicenseRequestResult };
export type LicenseFeedback = { message: string; isError: boolean } | null;

export type LicenseView = {
  snapshot: LicenseSnapshot | null;
  displayState: LicenseLocalState;
  hasAccess: boolean;
  isBusy: boolean;
  feedback: LicenseFeedback;
  startTrial: () => Promise<void>;
  activate: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const offlineMessage = 'Sem conexão com o servidor de licenças. Tente de novo em instantes.';

export const useLicense = (): LicenseView => {
  const [snapshot, setSnapshot] = useState<LicenseSnapshot | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<LicenseFeedback>(null);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
    const load = async (): Promise<void> => {
      const stored = (await chrome.storage.local.get(licenseStorageKey))[licenseStorageKey] as LicenseSnapshot | undefined;
      setSnapshot(stored ?? null);
    };
    const handleChange = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area === 'local' && changes[licenseStorageKey]) setSnapshot(changes[licenseStorageKey].newValue as LicenseSnapshot | null);
    };
    void load();
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hasSendAccess(snapshot, snapshot?.phone ?? null).then((access) => {
      if (!cancelled) setHasAccess(access);
    });
    return () => { cancelled = true; };
  }, [snapshot]);

  const run = useCallback(async (command: LicenseCommand): Promise<void> => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const response = await chrome.runtime.sendMessage(command) as RuntimeResponse;
      if (!response?.ok) throw new Error(response?.error || 'Não foi possível falar com o VozFlow.');
      const result = response.result;
      if (result?.offline) setFeedback({ message: offlineMessage, isError: true });
      else if (result && result.state !== result.snapshot.state) {
        setFeedback({ message: licenseCopy[result.state].title, isError: true });
      }
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : offlineMessage, isError: true });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const state = snapshot?.state ?? 'verificando';
  // Um passe vencido sem conexão não pode aparecer como "ativo".
  const displayState = licenseCopy[state].tone === 'ok' && !hasAccess ? 'verificando' : state;

  return {
    snapshot,
    displayState,
    hasAccess,
    isBusy,
    feedback,
    startTrial: () => run({ type: 'LICENSE_START_TRIAL' }),
    activate: (code: string) => run({ type: 'LICENSE_ACTIVATE', code }),
    refresh: () => run({ type: 'LICENSE_REFRESH' }),
  };
};
