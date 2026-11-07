import { describe, expect, it } from 'vitest';
import {
  applyLicenseOffline,
  applyLicenseResponse,
  createLicenseSnapshot,
  licenseRefreshIntervalMs,
  readPassExpiry,
  remainingDays,
  shouldRefreshLicense,
} from './license-state';

const phone = '5579998426046';
const now = Date.parse('2026-11-05T12:00:00Z');
const passFor = (exp: number): string => `${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.assinatura`;
const active = {
  ...createLicenseSnapshot('inst-1'),
  phone,
  state: 'licenca_ativa' as const,
  plan: 'Mensal',
  until: '2026-12-05T12:00:00Z',
  pass: passFor(now / 1000 + 72 * 3600),
  passExpiresAt: now + 72 * 3600 * 1000,
  checkedAt: now,
};

describe('license local state', () => {
  it('stores the pass and its expiry from the server', () => {
    const next = applyLicenseResponse(createLicenseSnapshot('inst-1'), phone, {
      state: 'teste_ativo', plan: 'Teste grátis', until: '2026-11-08T12:00:00Z', pass: passFor(1_800_000_000),
    }, now);
    expect(next).toMatchObject({ phone, state: 'teste_ativo', plan: 'Teste grátis', passExpiresAt: 1_800_000_000_000, checkedAt: now, offline: false });
  });

  it('drops the pass when the server blocks the license', () => {
    const next = applyLicenseResponse(active, phone, { state: 'licenca_revogada' }, now);
    expect(next).toMatchObject({ state: 'licenca_revogada', pass: null, passExpiresAt: null, plan: null });
  });

  it('keeps a valid pass when only the attempted key fails', () => {
    const next = applyLicenseResponse(active, phone, { state: 'chave_invalida' }, now + 1);
    expect(next).toMatchObject({ state: 'licenca_ativa', pass: active.pass, checkedAt: now + 1 });
  });

  it('treats unknown server states as no access', () => {
    expect(applyLicenseResponse(active, phone, { state: 'algo_novo' }, now).state).toBe('sem_acesso');
  });

  it('keeps the same number working offline but never another number', () => {
    expect(applyLicenseOffline(active, phone)).toMatchObject({ pass: active.pass, offline: true });
    expect(applyLicenseOffline(active, '5511999990000')).toMatchObject({ phone: '5511999990000', pass: null, state: 'verificando', offline: true });
  });

  it('refreshes on a new number, after the interval, when offline or near the pass expiry', () => {
    expect(shouldRefreshLicense(active, phone, now + 1000)).toBe(false);
    expect(shouldRefreshLicense(active, '5511999990000', now)).toBe(true);
    expect(shouldRefreshLicense(active, phone, now + licenseRefreshIntervalMs)).toBe(true);
    expect(shouldRefreshLicense({ ...active, offline: true }, phone, now)).toBe(true);
    expect(shouldRefreshLicense({ ...active, passExpiresAt: now + 3600_000 }, phone, now)).toBe(true);
    expect(shouldRefreshLicense(createLicenseSnapshot('inst-1'), phone, now)).toBe(true);
  });

  it('reads the pass expiry and remaining days defensively', () => {
    expect(readPassExpiry('lixo')).toBeNull();
    expect(readPassExpiry(null)).toBeNull();
    expect(remainingDays('2026-11-07T11:00:00Z', now)).toBe(2);
    expect(remainingDays('2026-11-01T00:00:00Z', now)).toBe(0);
    expect(remainingDays(null, now)).toBeNull();
  });
});
