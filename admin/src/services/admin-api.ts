import type { AuditEntry, BlockedNumber, License, PaymentEvent, Plan, Settings, Stats, Trial } from '../types';
import { supabase } from './supabase';

// Leituras passam pelo RLS (só admin com MFA); alterações passam pela Edge Function `admin`,
// que confere a sessão e grava o histórico.

const unwrap = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const fetchLicenses = async (): Promise<License[]> => unwrap(await supabase
  .from('licenses')
  .select('*, plan:plans(name), activations(phone, installation_id, activated_at, last_seen_at)')
  .order('created_at', { ascending: false })
  .limit(500));

export const fetchAudit = async (licenseId: string): Promise<AuditEntry[]> => unwrap(await supabase
  .from('audit_log')
  .select('id, actor, action, phone, details, created_at')
  .eq('license_id', licenseId)
  .order('created_at', { ascending: false })
  .limit(50));

export const fetchTrials = async (): Promise<Trial[]> => unwrap(await supabase
  .from('trials').select('*').order('started_at', { ascending: false }).limit(500));

export const fetchBlocked = async (): Promise<BlockedNumber[]> => unwrap(await supabase
  .from('blocked_numbers').select('*').order('created_at', { ascending: false }));

export const fetchPlans = async (): Promise<Plan[]> => unwrap(await supabase
  .from('plans').select('*').order('period_days'));

export const fetchEvents = async (): Promise<PaymentEvent[]> => unwrap(await supabase
  .from('payment_events').select('id, order_id, event, result, received_at, payload')
  .order('received_at', { ascending: false }).limit(100));

export const fetchSettings = async (): Promise<Settings> => unwrap(await supabase
  .from('app_settings')
  .select('trial_days, pass_hours, grace_days, trials_per_installation, min_extension_version')
  .single());

export const fetchStats = async (): Promise<Stats> => unwrap(await supabase.rpc('vf_admin_stats'));

const errorMessages: Record<string, string> = {
  nao_autorizado: 'Sessão sem permissão de administrador. Entre de novo.',
  campo_invalido: 'Confira os campos preenchidos.',
  acao_invalida: 'Ação não reconhecida pelo servidor.',
  erro_interno: 'O servidor não conseguiu concluir a ação. Tente de novo.',
};

export const invokeAdmin = async <T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } });
  if (error) {
    let code = '';
    let field = '';
    try {
      const body = await (error as { context?: Response }).context?.json() as { error?: string; field?: string };
      code = body?.error ?? '';
      field = body?.field ?? '';
    } catch {
      // Resposta sem corpo JSON: usa a mensagem genérica.
    }
    const message = errorMessages[code] ?? 'Não foi possível concluir a ação.';
    throw new Error(field ? `${message} (${field})` : message);
  }
  return data as T;
};
