// Linhas do banco de licenças lidas pelo painel (ver supabase/migrations).

export type LicenseStatus = 'ativa' | 'suspensa' | 'revogada' | 'expirada';

export type Plan = {
  id: string;
  name: string;
  period_days: number;
  max_numbers: number;
  cakto_offer_id: string | null;
  active: boolean;
};

export type Activation = {
  phone: string;
  installation_id: string;
  activated_at: string;
  last_seen_at: string;
};

export type License = {
  id: string;
  code: string;
  plan_id: string | null;
  status: LicenseStatus;
  expires_at: string | null;
  max_numbers: number;
  source: 'manual' | 'cakto';
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  cakto_order_id: string | null;
  auto_renew: boolean;
  delivered_at: string | null;
  note: string | null;
  created_at: string;
  plan: { name: string } | null;
  activations: Activation[];
};

export type Trial = {
  phone: string;
  installation_id: string;
  started_at: string;
  ends_at: string;
  ended_by_admin: boolean;
};

export type BlockedNumber = {
  phone: string;
  reason: string;
  created_at: string;
};

export type PaymentEvent = {
  id: number;
  order_id: string;
  event: string;
  result: string | null;
  received_at: string;
  payload: { offer?: { id?: string; name?: string } | null; amount?: number | null; paymentMethod?: string };
};

export type AuditEntry = {
  id: number;
  actor: string;
  action: string;
  phone: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type Settings = {
  trial_days: number;
  pass_hours: number;
  grace_days: number;
  trials_per_installation: number;
  min_extension_version: string;
};

export type Stats = {
  trials: number;
  activeTrials: number;
  convertedTrials: number;
  activeLicenses: number;
  pendingDelivery: number;
  unmatchedEvents: number;
};
