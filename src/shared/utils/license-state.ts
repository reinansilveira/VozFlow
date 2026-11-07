import type { LicenseLocalState, LicenseSnapshot } from '../types';

// Regras puras do estado local da licença: como aplicar a resposta do servidor, o que
// fazer sem conexão e quando é hora de renovar o passe.

export const licenseRefreshIntervalMs = 6 * 60 * 60 * 1000;
export const passRenewBeforeMs = 24 * 60 * 60 * 1000;

export type LicenseApiResponse = {
  state?: string;
  plan?: string | null;
  until?: string | null;
  pass?: string;
  minVersion?: string;
};

const knownStates = new Set<LicenseLocalState>([
  'teste_ativo', 'teste_expirado', 'teste_negado_instalacao', 'licenca_ativa', 'licenca_suspensa',
  'licenca_revogada', 'licenca_expirada', 'chave_invalida', 'limite_numeros', 'numero_bloqueado',
  'sem_acesso', 'versao_desatualizada',
]);

// Estados que só dizem respeito à tentativa atual: não apagam um passe ainda válido.
const attemptStates = new Set<LicenseLocalState>(['chave_invalida', 'limite_numeros', 'teste_negado_instalacao']);

export const createLicenseSnapshot = (installationId: string): LicenseSnapshot => ({
  installationId,
  phone: null,
  state: 'verificando',
  plan: null,
  until: null,
  pass: null,
  passExpiresAt: null,
  checkedAt: null,
  offline: false,
  minVersion: null,
});

// Lê a validade do passe sem verificar a assinatura; serve só para agendar a renovação.
export const readPassExpiry = (pass: string | null | undefined): number | null => {
  try {
    const body = pass?.split('.')[0];
    if (!body) return null;
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

export const applyLicenseResponse = (
  snapshot: LicenseSnapshot,
  phone: string,
  response: LicenseApiResponse,
  nowMs: number,
): LicenseSnapshot => {
  const state = knownStates.has(response.state as LicenseLocalState) ? response.state as LicenseLocalState : 'sem_acesso';
  const samePhone = snapshot.phone === phone;

  if (attemptStates.has(state) && samePhone && snapshot.pass) {
    return { ...snapshot, checkedAt: nowMs, offline: false };
  }

  return {
    ...snapshot,
    phone,
    state,
    plan: response.pass ? response.plan ?? null : null,
    until: response.pass ? response.until ?? null : null,
    pass: response.pass ?? null,
    passExpiresAt: readPassExpiry(response.pass),
    checkedAt: nowMs,
    offline: false,
    minVersion: response.minVersion ?? null,
  };
};

// Sem servidor, o passe do mesmo número continua valendo até vencer; outro número fica sem acesso.
export const applyLicenseOffline = (snapshot: LicenseSnapshot, phone: string): LicenseSnapshot => {
  if (snapshot.phone === phone) return { ...snapshot, offline: true };
  return { ...createLicenseSnapshot(snapshot.installationId), phone, offline: true, state: 'verificando' };
};

export const shouldRefreshLicense = (snapshot: LicenseSnapshot, phone: string, nowMs: number): boolean => {
  if (snapshot.phone !== phone || snapshot.checkedAt === null || snapshot.offline) return true;
  if (nowMs - snapshot.checkedAt >= licenseRefreshIntervalMs) return true;
  return snapshot.passExpiresAt !== null && snapshot.passExpiresAt - nowMs <= passRenewBeforeMs;
};

export const remainingDays = (until: string | null, nowMs: number): number | null => {
  if (!until) return null;
  const diff = Date.parse(until) - nowMs;
  return Number.isNaN(diff) ? null : Math.max(0, Math.ceil(diff / 86_400_000));
};
