// Passe de licença: `base64url(JSON).base64url(assinatura Ed25519)`. O formato precisa
// continuar igual ao verificado pela extensão em `src/shared/utils/license-pass.ts`.

export type LicensePassKind = 'trial' | 'license';

export type LicensePassPayload = {
  v: 1;
  kind: LicensePassKind;
  phone: string;
  installationId: string;
  plan: string;
  licenseId: string | null;
  until: string | null;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const importSigningKey = (pkcs8Base64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('pkcs8', fromBase64(pkcs8Base64), { name: 'Ed25519' }, false, ['sign']);

export const signPass = async (payload: LicensePassPayload, key: CryptoKey): Promise<string> => {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
};

type BuildPassInput = {
  kind: LicensePassKind;
  phone: string;
  installationId: string;
  plan: string;
  licenseId: string | null;
  until: string | null;
  passHours: number;
  now?: Date;
};

// O passe nunca vale além do fim do teste ou da licença.
export const buildPassPayload = (input: BuildPassInput): LicensePassPayload => {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const untilSeconds = input.until ? Math.floor(new Date(input.until).getTime() / 1000) : Infinity;
  return {
    v: 1,
    kind: input.kind,
    phone: input.phone,
    installationId: input.installationId,
    plan: input.plan,
    licenseId: input.licenseId,
    until: input.until,
    iat: nowSeconds,
    exp: Math.min(nowSeconds + input.passHours * 3600, untilSeconds),
  };
};
