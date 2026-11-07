import type { License, LicenseStatus } from '../types';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export const formatDateTime = (value: string | null): string => value ? dateFormatter.format(new Date(value)) : '—';
export const formatDate = (value: string | null): string => value ? dayFormatter.format(new Date(value)) : 'Sem vencimento';

// 5579998426046 → +55 79 99842-6046 (outros países ficam só com o "+").
export const formatPhone = (phone: string | null): string => {
  if (!phone) return '—';
  const match = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `+55 ${match[1]} ${match[2]}-${match[3]}` : `+${phone}`;
};

export const statusLabels: Record<LicenseStatus, string> = {
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  revogada: 'Revogada',
  expirada: 'Expirada',
};

// A licença vence pela data mesmo que o estado gravado ainda seja "ativa".
export const effectiveStatus = (license: Pick<License, 'status' | 'expires_at'>, nowMs = Date.now()): LicenseStatus => {
  if (license.status === 'ativa' && license.expires_at && Date.parse(license.expires_at) <= nowMs) return 'expirada';
  return license.status;
};

export const addDays = (base: string | null, days: number, nowMs = Date.now()): string => {
  const start = Math.max(base ? Date.parse(base) : nowMs, nowMs);
  return new Date(start + days * 86_400_000).toISOString();
};

export const deliveryMessage = (license: Pick<License, 'code' | 'buyer_name'>): string => [
  `Olá${license.buyer_name ? `, ${license.buyer_name.split(' ')[0]}` : ''}! Obrigado por assinar o VozFlow.`,
  `Sua chave de licença: ${license.code}`,
  'Para ativar: abra o WhatsApp Web, clique no VozFlow, em "Tenho uma chave" e cole a chave.',
].join('\n');

export const whatsappLink = (phone: string, text: string): string =>
  `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

const actionLabels: Record<string, string> = {
  licenca_criada: 'Licença criada',
  licenca_alterada: 'Licença alterada',
  licenca_ativada: 'Chave ativada em um número',
  ativacao_recusada_limite: 'Ativação recusada pelo limite',
  numero_desvinculado: 'Número desvinculado',
  purchase_approved: 'Compra aprovada (Cakto)',
  subscription_renewed: 'Assinatura renovada (Cakto)',
  refund_requested: 'Pedido de reembolso (Cakto)',
  refund: 'Reembolso (Cakto)',
  chargeback: 'Chargeback (Cakto)',
  subscription_canceled: 'Assinatura cancelada (Cakto)',
  subscription_resumed: 'Assinatura retomada (Cakto)',
};

export const actionLabel = (action: string): string => actionLabels[action] ?? action.replace(/_/g, ' ');

// Resume o que mudou numa entrada do histórico.
export const describeDetails = (details: Record<string, unknown>): string => {
  const parts: string[] = [];
  if (typeof details.status === 'string') parts.push(`situação: ${statusLabels[details.status as LicenseStatus] ?? details.status}`);
  if ('expires_at' in details) parts.push(`vence: ${formatDate(details.expires_at as string | null)}`);
  if ('delivered_at' in details) parts.push(details.delivered_at ? 'marcada como entregue' : 'entrega desmarcada');
  if (typeof details.max_numbers === 'number') parts.push(`limite: ${details.max_numbers} número(s)`);
  if ('note' in details) parts.push('observação alterada');
  if (typeof details.resultado === 'string') parts.push(details.resultado.replace(/_/g, ' '));
  return parts.join(' · ');
};
