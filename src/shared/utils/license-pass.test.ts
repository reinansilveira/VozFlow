import { describe, expect, it } from 'vitest';
import { buildPassPayload, importSigningKey, signPass, toBase64Url } from '../../../supabase/functions/_shared/pass';
import { normalizePhone as normalizeServerPhone } from '../../../supabase/functions/_shared/phone';
import { importPassPublicKey, verifyLicensePass } from './license-pass';
import { normalizePhone } from './phone';

const createKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    signing: await importSigningKey(btoa(String.fromCharCode(...pkcs8))),
    verifying: await importPassPublicKey(toBase64Url(raw)),
  };
};

const now = new Date('2026-11-05T12:00:00Z');
const payload = buildPassPayload({
  kind: 'license',
  phone: '5579998426046',
  installationId: 'inst-0000000000000001',
  plan: 'Mensal',
  licenseId: 'lic-1',
  until: '2026-12-08T12:00:00Z',
  passHours: 72,
  now,
});

describe('license pass', () => {
  it('accepts a pass signed by the server for the connected number', async () => {
    const keys = await createKeys();
    const token = await signPass(payload, keys.signing);
    const result = await verifyLicensePass({ token, publicKey: keys.verifying, phone: '5579998426046', nowMs: now.getTime() });
    expect(result).toEqual({ valid: true, pass: payload });
  });

  it('rejects a tampered pass', async () => {
    const keys = await createKeys();
    const token = await signPass(payload, keys.signing);
    const forged = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: payload.exp + 999_999 })));
    const result = await verifyLicensePass({
      token: `${forged}.${token.split('.')[1]}`, publicKey: keys.verifying, phone: payload.phone, nowMs: now.getTime(),
    });
    expect(result).toEqual({ valid: false, reason: 'assinatura' });
  });

  it('rejects a pass signed by another key', async () => {
    const [server, attacker] = await Promise.all([createKeys(), createKeys()]);
    const token = await signPass(payload, attacker.signing);
    const result = await verifyLicensePass({ token, publicKey: server.verifying, phone: payload.phone, nowMs: now.getTime() });
    expect(result).toEqual({ valid: false, reason: 'assinatura' });
  });

  it('rejects an expired pass and a pass for another number', async () => {
    const keys = await createKeys();
    const token = await signPass(payload, keys.signing);
    expect(await verifyLicensePass({ token, publicKey: keys.verifying, phone: payload.phone, nowMs: payload.exp * 1000 }))
      .toEqual({ valid: false, reason: 'vencido' });
    expect(await verifyLicensePass({ token, publicKey: keys.verifying, phone: '5511999990000', nowMs: now.getTime() }))
      .toEqual({ valid: false, reason: 'outro_numero' });
  });

  it('rejects malformed tokens', async () => {
    const keys = await createKeys();
    for (const token of ['', 'abc', 'a.b.c', '%%%.%%%']) {
      expect(await verifyLicensePass({ token, publicKey: keys.verifying, phone: payload.phone })).toMatchObject({ valid: false });
    }
  });

  it('never lets the pass outlive the trial or license', () => {
    const shortTrial = buildPassPayload({ ...payload, kind: 'trial', until: '2026-11-06T12:00:00Z', passHours: 72, now });
    expect(shortTrial.exp).toBe(Date.parse('2026-11-06T12:00:00Z') / 1000);
    expect(payload.exp).toBe(now.getTime() / 1000 + 72 * 3600);
  });
});

describe('phone normalization', () => {
  it.each([
    ['5579998426046', '5579998426046'],
    ['557998426046', '5579998426046'],
    ['557998426046@c.us', '5579998426046'],
    ['+55 (79) 99842-6046', '5579998426046'],
    ['551133334444', '551133334444'],
    ['14155550123', '14155550123'],
    ['123', null],
    ['', null],
  ])('normalizes %s the same way on the extension and the server', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
    expect(normalizeServerPhone(raw)).toBe(expected);
  });
});
