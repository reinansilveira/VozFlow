import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceClient } from '../_shared/db.ts';
import { corsHeaders, json, readJson, requireEnv } from '../_shared/http.ts';
import { normalizePhone } from '../_shared/phone.ts';

// Ações do painel. Só executa para administradores com sessão em duas etapas e grava cada
// ação no histórico (`audit_log`).

type Input = Record<string, unknown>;
type Db = ReturnType<typeof serviceClient>;
type ActionContext = { db: Db; actor: string; input: Input };
type ActionResult = { status?: number; body: unknown };

const statuses = ['ativa', 'suspensa', 'revogada', 'expirada'];

const str = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const int = (value: unknown, min: number, max: number): number | null =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : null;
const date = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;

const invalid = (field: string): ActionResult => ({ status: 400, body: { error: 'campo_invalido', field } });
const failed = (message: string): ActionResult => {
  console.error('admin', message);
  return { status: 500, body: { error: 'erro_interno' } };
};

const audit = (ctx: ActionContext, action: string, details: Input, licenseId?: string | null, phone?: string | null) =>
  ctx.db.from('audit_log').insert({ actor: ctx.actor, action, details, license_id: licenseId ?? null, phone: phone ?? null });

const actions: Record<string, (ctx: ActionContext) => Promise<ActionResult>> = {
  createLicense: async (ctx) => {
    const { input, db } = ctx;
    const maxNumbers = int(input.maxNumbers, 1, 50);
    if (!maxNumbers) return invalid('maxNumbers');
    const expiresAt = input.expiresAt === null ? null : date(input.expiresAt);
    if (input.expiresAt !== null && !expiresAt) return invalid('expiresAt');
    const { data: code, error: codeError } = await db.rpc('vf_new_license_code');
    if (codeError) return failed(codeError.message);
    const { data, error } = await db.from('licenses').insert({
      code,
      plan_id: str(input.planId, 64),
      expires_at: expiresAt,
      max_numbers: maxNumbers,
      buyer_name: str(input.buyerName),
      buyer_email: str(input.buyerEmail)?.toLowerCase() ?? null,
      buyer_phone: normalizePhone(str(input.buyerPhone, 40)),
      note: str(input.note, 1000),
    }).select().single();
    if (error) return failed(error.message);
    await audit(ctx, 'licenca_criada', { code }, data.id);
    return { body: { license: data } };
  },

  updateLicense: async (ctx) => {
    const { input, db } = ctx;
    const licenseId = str(input.licenseId, 64);
    if (!licenseId) return invalid('licenseId');
    const changes: Input = {};
    if ('status' in input) {
      if (!statuses.includes(String(input.status))) return invalid('status');
      changes.status = input.status;
    }
    if ('expiresAt' in input) {
      const expiresAt = input.expiresAt === null ? null : date(input.expiresAt);
      if (input.expiresAt !== null && !expiresAt) return invalid('expiresAt');
      changes.expires_at = expiresAt;
    }
    if ('maxNumbers' in input) {
      const maxNumbers = int(input.maxNumbers, 1, 50);
      if (!maxNumbers) return invalid('maxNumbers');
      changes.max_numbers = maxNumbers;
    }
    if ('note' in input) changes.note = str(input.note, 1000);
    if ('delivered' in input) changes.delivered_at = input.delivered ? new Date().toISOString() : null;
    if (!Object.keys(changes).length) return invalid('alteracoes');

    const { data, error } = await db.from('licenses').update(changes).eq('id', licenseId).select().single();
    if (error) return failed(error.message);
    await audit(ctx, 'licenca_alterada', changes, licenseId);
    return { body: { license: data } };
  },

  unbindNumber: async (ctx) => {
    const licenseId = str(ctx.input.licenseId, 64);
    const phone = normalizePhone(str(ctx.input.phone, 40));
    if (!licenseId) return invalid('licenseId');
    if (!phone) return invalid('phone');
    const { error } = await ctx.db.from('activations').delete().eq('license_id', licenseId).eq('phone', phone);
    if (error) return failed(error.message);
    await audit(ctx, 'numero_desvinculado', {}, licenseId, phone);
    return { body: { ok: true } };
  },

  blockNumber: async (ctx) => {
    const phone = normalizePhone(str(ctx.input.phone, 40));
    const reason = str(ctx.input.reason, 300) ?? 'Bloqueado pelo admin';
    if (!phone) return invalid('phone');
    const { error } = await ctx.db.from('blocked_numbers').upsert({ phone, reason });
    if (error) return failed(error.message);
    await audit(ctx, 'numero_bloqueado', { reason }, null, phone);
    return { body: { ok: true } };
  },

  unblockNumber: async (ctx) => {
    const phone = normalizePhone(str(ctx.input.phone, 40));
    if (!phone) return invalid('phone');
    const { error } = await ctx.db.from('blocked_numbers').delete().eq('phone', phone);
    if (error) return failed(error.message);
    await audit(ctx, 'numero_desbloqueado', {}, null, phone);
    return { body: { ok: true } };
  },

  endTrial: async (ctx) => {
    const phone = normalizePhone(str(ctx.input.phone, 40));
    if (!phone) return invalid('phone');
    const { error } = await ctx.db.from('trials').update({ ended_by_admin: true }).eq('phone', phone);
    if (error) return failed(error.message);
    await audit(ctx, 'teste_encerrado', {}, null, phone);
    return { body: { ok: true } };
  },

  grantTrial: async (ctx) => {
    const phone = normalizePhone(str(ctx.input.phone, 40));
    const days = int(ctx.input.days, 1, 30);
    if (!phone) return invalid('phone');
    if (!days) return invalid('days');
    const endsAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error } = await ctx.db.from('trials').upsert({
      phone, installation_id: 'admin', started_at: new Date().toISOString(), ends_at: endsAt, ended_by_admin: false,
    });
    if (error) return failed(error.message);
    await audit(ctx, 'teste_concedido', { days }, null, phone);
    return { body: { ok: true } };
  },

  savePlan: async (ctx) => {
    const { input, db } = ctx;
    const name = str(input.name, 80);
    const periodDays = int(input.periodDays, 1, 3660);
    const maxNumbers = int(input.maxNumbers, 1, 50);
    if (!name) return invalid('name');
    if (!periodDays) return invalid('periodDays');
    if (!maxNumbers) return invalid('maxNumbers');
    const plan = {
      ...(str(input.id, 64) ? { id: str(input.id, 64) } : {}),
      name,
      period_days: periodDays,
      max_numbers: maxNumbers,
      cakto_offer_id: str(input.caktoOfferId, 64),
      active: input.active !== false,
    };
    const { data, error } = await db.from('plans').upsert(plan).select().single();
    if (error) return failed(error.message);
    await audit(ctx, 'plano_salvo', plan);
    return { body: { plan: data } };
  },

  saveSettings: async (ctx) => {
    const { input, db } = ctx;
    const settings = {
      trial_days: int(input.trialDays, 1, 30),
      pass_hours: int(input.passHours, 1, 720),
      grace_days: int(input.graceDays, 0, 30),
      trials_per_installation: int(input.trialsPerInstallation, 1, 10),
      min_extension_version: /^\d+(\.\d+){0,3}$/.test(String(input.minExtensionVersion))
        ? String(input.minExtensionVersion) : null,
    };
    const missing = Object.entries(settings).find(([, value]) => value === null);
    if (missing) return invalid(missing[0]);
    const { data, error } = await db.from('app_settings')
      .update({ ...settings, updated_at: new Date().toISOString() }).eq('id', true).select().single();
    if (error) return failed(error.message);
    await audit(ctx, 'configuracoes_salvas', settings);
    return { body: { settings: data } };
  },
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'metodo_invalido' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const userClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: userData }, { data: isAdmin }] = await Promise.all([
    userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, '')),
    userClient.rpc('is_admin'),
  ]);
  if (!userData?.user || isAdmin !== true) return json({ error: 'nao_autorizado' }, 403);

  const input = await readJson(request);
  const action = input && typeof input.action === 'string' ? actions[input.action] : undefined;
  if (!input || !action) return json({ error: 'acao_invalida' }, 400);

  const result = await action({ db: serviceClient(), actor: `admin:${userData.user.email ?? userData.user.id}`, input });
  return json(result.body, result.status ?? 200);
});
