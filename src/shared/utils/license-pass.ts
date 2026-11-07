import type { LicensePass } from '../types';

// Verifica o passe assinado pelo servidor (`supabase/functions/_shared/pass.ts`).
// A extensão só tem a chave pública; um passe alterado, vencido ou de outro número é recusado.

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const importPassPublicKey = (rawBase64Url: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', fromBase64Url(rawBase64Url), { name: 'Ed25519' }, false, ['verify']);

const isLicensePass = (value: unknown): value is LicensePass => {
  if (!value || typeof value !== 'object') return false;
  const pass = value as Record<string, unknown>;
  return pass.v === 1
    && (pass.kind === 'trial' || pass.kind === 'license')
    && typeof pass.phone === 'string'
    && typeof pass.installationId === 'string'
    && typeof pass.plan === 'string'
    && typeof pass.iat === 'number'
    && typeof pass.exp === 'number';
};

type VerifyPassInput = {
  token: string;
  publicKey: CryptoKey;
  phone: string;
  nowMs?: number;
};

export type VerifyPassResult =
  | { valid: true; pass: LicensePass }
  | { valid: false; reason: 'formato' | 'assinatura' | 'vencido' | 'outro_numero' };

export const verifyLicensePass = async ({ token, publicKey, phone, nowMs = Date.now() }: VerifyPassInput): Promise<VerifyPassResult> => {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return { valid: false, reason: 'formato' };

  let signatureOk = false;
  try {
    signatureOk = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, fromBase64Url(signature), encoder.encode(body));
  } catch {
    return { valid: false, reason: 'formato' };
  }
  if (!signatureOk) return { valid: false, reason: 'assinatura' };

  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(body)));
  } catch {
    return { valid: false, reason: 'formato' };
  }
  if (!isLicensePass(payload)) return { valid: false, reason: 'formato' };
  if (payload.exp * 1000 <= nowMs) return { valid: false, reason: 'vencido' };
  if (payload.phone !== phone) return { valid: false, reason: 'outro_numero' };

  return { valid: true, pass: payload };
};
