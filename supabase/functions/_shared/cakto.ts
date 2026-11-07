import { normalizePhone } from './phone.ts';

// Webhook da Cakto: autenticação e leitura do pedido (https://docs.cakto.com.br/conceitos/webhooks).

const encoder = new TextEncoder();
const signatureToleranceSeconds = 300;

const constantTimeEqual = (a: string, b: string): boolean => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
};

const hmacHex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

type VerifyWebhookInput = {
  rawBody: string;
  secret: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  nowSeconds?: number;
};

// Com os cabeçalhos de assinatura, valida o HMAC de `{timestamp}.{corpo}`; sem eles, o campo
// `secret` do corpo. Qualquer falha recusa o evento.
export const verifyCaktoWebhook = async (input: VerifyWebhookInput): Promise<boolean> => {
  if (!input.secret) return false;

  if (input.signatureHeader || input.timestampHeader) {
    const timestamp = Number(input.timestampHeader);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > signatureToleranceSeconds) return false;
    const v1 = (input.signatureHeader ?? '').split(',').map((part) => part.trim())
      .find((part) => part.startsWith('v1='))?.slice(3);
    if (!v1) return false;
    return constantTimeEqual(v1, await hmacHex(input.secret, `${input.timestampHeader}.${input.rawBody}`));
  }

  try {
    const body = JSON.parse(input.rawBody) as { secret?: unknown };
    return typeof body.secret === 'string' && constantTimeEqual(body.secret, input.secret);
  } catch {
    return false;
  }
};

export type CaktoEventInput = {
  event: string;
  orderId: string;
  subscriptionId: string | null;
  offerId: string | null;
  paidAt: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  summary: Record<string, unknown>;
};

// Só o necessário para auditoria: sem documento, endereço nem dados de cartão do comprador.
const summaryFields = [
  'id', 'refId', 'status', 'offer_type', 'baseAmount', 'amount', 'currency', 'paymentMethod', 'offer',
  'product', 'subscription', 'subscription_period', 'createdAt', 'paidAt', 'refundedAt', 'chargedbackAt',
  'canceledAt', 'refund_reason',
];

type CaktoOrder = {
  id?: unknown;
  paidAt?: unknown;
  offer?: { id?: unknown } | null;
  subscription?: { id?: unknown } | string | null;
  customer?: { name?: unknown; email?: unknown; phone?: unknown } | null;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null;

// Converte o corpo em eventos de pedido. O webhook V2 manda `data` como lista; o abandono de
// checkout não tem pedido e é ignorado.
export const parseCaktoEvents = (body: unknown): CaktoEventInput[] => {
  if (!body || typeof body !== 'object') return [];
  const { event, data } = body as { event?: unknown; data?: unknown };
  if (typeof event !== 'string' || event === 'checkout_abandonment') return [];

  const orders = (Array.isArray(data) ? data : [data]) as CaktoOrder[];
  return orders.flatMap((order) => {
    const orderId = text(order?.id);
    if (!orderId) return [];
    const subscription = order.subscription;
    return [{
      event,
      orderId,
      subscriptionId: typeof subscription === 'object' ? text(subscription?.id) : text(subscription),
      offerId: text(order.offer?.id),
      paidAt: text(order.paidAt),
      buyerName: text(order.customer?.name),
      buyerEmail: text(order.customer?.email)?.toLowerCase() ?? null,
      buyerPhone: normalizePhone(text(order.customer?.phone)),
      summary: Object.fromEntries(summaryFields
        .filter((field) => field in order)
        .map((field) => [field, (order as Record<string, unknown>)[field]])),
    }];
  });
};
