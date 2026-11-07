import type { LicenseLocalState, LicenseSnapshot } from '../types';
import { importPassPublicKey, verifyLicensePass } from '../utils/license-pass';
import {
  applyLicenseOffline,
  applyLicenseResponse,
  createLicenseSnapshot,
  type LicenseApiResponse,
} from '../utils/license-state';
import { normalizePhone } from '../utils/phone';

// Licença no lado da extensão: guarda o estado em `chrome.storage.local`, conversa com o
// servidor de licenças (Supabase) e decide se os envios estão liberados.

export const licenseStorageKey = 'vozflow.license';

export const licenseConfig = {
  apiUrl: (import.meta.env.VITE_LICENSE_API_URL || '').replace(/\/+$/, ''),
  publicKey: import.meta.env.VITE_LICENSE_PUBLIC_KEY || '',
  checkoutUrl: import.meta.env.VITE_CHECKOUT_URL || '',
  supportUrl: import.meta.env.VITE_SUPPORT_URL || '',
  siteUrl: (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, ''),
};

export const isLicenseConfigured = (): boolean => Boolean(licenseConfig.apiUrl && licenseConfig.publicKey);

const requestTimeoutMs = 10_000;
let publicKeyPromise: Promise<CryptoKey> | null = null;

export const getLicenseSnapshot = async (): Promise<LicenseSnapshot> => {
  const stored = (await chrome.storage.local.get(licenseStorageKey))[licenseStorageKey] as LicenseSnapshot | undefined;
  if (stored?.installationId) return stored;
  const snapshot = createLicenseSnapshot(crypto.randomUUID());
  await chrome.storage.local.set({ [licenseStorageKey]: snapshot });
  return snapshot;
};

export const saveLicenseSnapshot = async (snapshot: LicenseSnapshot): Promise<void> => {
  await chrome.storage.local.set({ [licenseStorageKey]: snapshot });
};

// O passe é conferido com a chave pública embutida no build e com o número conectado agora.
export const hasSendAccess = async (snapshot: LicenseSnapshot | null, connectedPhone: string | null): Promise<boolean> => {
  const phone = normalizePhone(connectedPhone);
  if (!snapshot?.pass || !phone || !licenseConfig.publicKey) return false;
  try {
    publicKeyPromise ??= importPassPublicKey(licenseConfig.publicKey);
    const result = await verifyLicensePass({ token: snapshot.pass, publicKey: await publicKeyPromise, phone });
    return result.valid;
  } catch {
    return false;
  }
};

type LicenseOperation = 'trial-start' | 'license-activate' | 'pass-refresh';

const callLicenseApi = async (operation: LicenseOperation, body: Record<string, string>): Promise<LicenseApiResponse | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${licenseConfig.apiUrl}/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json() as LicenseApiResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export type LicenseRequestResult = { snapshot: LicenseSnapshot; state: LicenseLocalState; offline: boolean };

// Executa uma operação no servidor para o número conectado e grava o novo estado.
export const requestLicense = async (
  operation: LicenseOperation,
  connectedPhone: string | null,
  code = '',
): Promise<LicenseRequestResult> => {
  const snapshot = await getLicenseSnapshot();
  const phone = normalizePhone(connectedPhone);

  if (!isLicenseConfigured()) {
    const next = { ...snapshot, phone, state: 'nao_configurado' as const, pass: null, passExpiresAt: null };
    await saveLicenseSnapshot(next);
    return { snapshot: next, state: next.state, offline: false };
  }
  if (!phone) {
    const next = { ...snapshot, state: 'whatsapp_desconectado' as const };
    await saveLicenseSnapshot(next);
    return { snapshot: next, state: next.state, offline: false };
  }

  const response = await callLicenseApi(operation, {
    phone,
    installationId: snapshot.installationId,
    version: chrome.runtime.getManifest().version,
    ...(code ? { code } : {}),
  });
  const next = response?.state
    ? applyLicenseResponse(snapshot, phone, response, Date.now())
    : applyLicenseOffline(snapshot, phone);
  await saveLicenseSnapshot(next);
  return {
    snapshot: next,
    state: (response?.state as LicenseLocalState | undefined) ?? next.state,
    offline: !response?.state,
  };
};
