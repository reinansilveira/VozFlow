import { serviceClient } from './db.ts';
import { clientIp, corsHeaders, json, readJson, requireEnv } from './http.ts';
import { buildPassPayload, importSigningKey, signPass } from './pass.ts';
import { normalizePhone } from './phone.ts';
import { compareVersions } from './version.ts';

// Fluxo comum das rotas públicas usadas pela extensão: valida a entrada, aplica limite de
// requisições e versão mínima, chama a regra no banco e assina o passe quando há acesso.

type AccessResult = {
  state: string;
  kind?: 'trial' | 'license';
  plan?: string;
  licenseId?: string;
  until?: string | null;
};

type Operation = 'trial' | 'activate' | 'refresh';

const installationPattern = /^[A-Za-z0-9-]{16,64}$/;
let signingKey: Promise<CryptoKey> | null = null;

const rpcFor = (operation: Operation, phone: string, installationId: string, code: string) => {
  const db = serviceClient();
  if (operation === 'trial') return db.rpc('vf_trial_start', { p_phone: phone, p_installation_id: installationId });
  if (operation === 'activate') {
    return db.rpc('vf_license_activate', { p_code: code, p_phone: phone, p_installation_id: installationId });
  }
  return db.rpc('vf_access', { p_phone: phone, p_installation_id: installationId });
};

export const handleLicensingRequest = async (request: Request, operation: Operation): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'metodo_invalido' }, 405);

  const body = await readJson(request);
  const phone = normalizePhone(typeof body?.phone === 'string' ? body.phone : null);
  const installationId = typeof body?.installationId === 'string' ? body.installationId : '';
  const version = typeof body?.version === 'string' ? body.version : '0';
  const code = typeof body?.code === 'string' ? body.code.slice(0, 32) : '';
  if (!phone || !installationPattern.test(installationId) || (operation === 'activate' && !code)) {
    return json({ error: 'requisicao_invalida' }, 400);
  }

  const db = serviceClient();
  const limit = operation === 'refresh' ? 30 : 10;
  const [byInstallation, byIp] = await Promise.all([
    db.rpc('vf_throttle', { p_key: `inst:${installationId}`, p_limit: limit, p_window_seconds: 600 }),
    db.rpc('vf_throttle', { p_key: `ip:${clientIp(request)}`, p_limit: limit * 5, p_window_seconds: 600 }),
  ]);
  if (byInstallation.data === false || byIp.data === false) return json({ error: 'muitas_requisicoes' }, 429);

  // Guarda obrigatória dos registros de acesso (Marco Civil, art. 15); uma falha aqui não bloqueia o cliente.
  const { error: logError } = await db.rpc('vf_log_access', {
    p_ip: clientIp(request), p_operation: operation, p_phone: phone, p_installation_id: installationId,
  });
  if (logError) console.error('registro de acesso', logError.message);

  const { data: settings, error: settingsError } = await db.from('app_settings')
    .select('pass_hours, min_extension_version').single();
  if (settingsError || !settings) return json({ error: 'erro_interno' }, 500);
  if (compareVersions(version, settings.min_extension_version) < 0) {
    return json({ state: 'versao_desatualizada', minVersion: settings.min_extension_version });
  }

  const { data, error } = await rpcFor(operation, phone, installationId, code);
  if (error || !data) {
    console.error('licenciamento', operation, error?.message);
    return json({ error: 'erro_interno' }, 500);
  }

  const access = data as AccessResult;
  if (!access.kind) return json({ state: access.state, phone });

  signingKey ??= importSigningKey(requireEnv('LICENSE_PASS_PRIVATE_KEY'));
  const pass = await signPass(buildPassPayload({
    kind: access.kind,
    phone,
    installationId,
    plan: access.plan ?? '',
    licenseId: access.licenseId ?? null,
    until: access.until ?? null,
    passHours: settings.pass_hours,
  }), await signingKey);

  return json({ state: access.state, phone, plan: access.plan, until: access.until ?? null, pass });
};
