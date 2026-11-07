import { parseCaktoEvents, verifyCaktoWebhook } from '../_shared/cakto.ts';
import { serviceClient } from '../_shared/db.ts';
import { json, requireEnv } from '../_shared/http.ts';

// Recebe os eventos da Cakto. Responde 2xx assim que o evento é registrado; repetições do
// mesmo pedido e evento não têm efeito (idempotência garantida em `vf_cakto_event`).
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'metodo_invalido' }, 405);

  const rawBody = await request.text();
  const authentic = await verifyCaktoWebhook({
    rawBody,
    secret: requireEnv('CAKTO_WEBHOOK_SECRET'),
    signatureHeader: request.headers.get('x-cakto-signature'),
    timestampHeader: request.headers.get('x-cakto-timestamp'),
  });
  if (!authentic) return json({ error: 'nao_autorizado' }, 401);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'requisicao_invalida' }, 400);
  }

  const db = serviceClient();
  const results: string[] = [];
  for (const event of parseCaktoEvents(body)) {
    const { data, error } = await db.rpc('vf_cakto_event', {
      p_event: event.event,
      p_order_id: event.orderId,
      p_subscription_id: event.subscriptionId,
      p_offer_id: event.offerId,
      p_paid_at: event.paidAt,
      p_buyer_name: event.buyerName,
      p_buyer_email: event.buyerEmail,
      p_buyer_phone: event.buyerPhone,
      p_payload: event.summary,
    });
    if (error) {
      console.error('cakto', event.event, event.orderId, error.message);
      return json({ error: 'erro_interno' }, 500);
    }
    results.push(String(data));
  }

  return json({ ok: true, results });
});
