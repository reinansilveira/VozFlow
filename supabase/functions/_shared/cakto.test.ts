import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCaktoEvents, verifyCaktoWebhook } from './cakto';
import { compareVersions } from './version';

const secret = 'b3f1a9c2-7b4d-4a8e-9f01-2c6d5b8a4e37';
const order = {
  id: 'b3df956e-1998-4322-b091-ac0c54f7b4ba',
  status: 'paid',
  paidAt: '2026-11-05T16:01:55-03:00',
  offer: { id: 'a8BcHrY', name: 'Mensal', price: 47 },
  subscription: { id: 'sub-1' },
  customer: { name: 'Maria', email: 'Maria@Example.com', phone: '557998426046', docNumber: '12345678909' },
  card: { lastDigits: '4242' },
};
const rawBody = JSON.stringify({ secret, event: 'purchase_approved', data: order });

describe('cakto webhook authentication', () => {
  it('accepts the secret in the body when there are no signature headers', async () => {
    expect(await verifyCaktoWebhook({ rawBody, secret, signatureHeader: null, timestampHeader: null })).toBe(true);
    expect(await verifyCaktoWebhook({ rawBody, secret: 'outro', signatureHeader: null, timestampHeader: null })).toBe(false);
  });

  it('validates the HMAC signature and its timestamp', async () => {
    const timestamp = '1762455715';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const base = { rawBody, secret, timestampHeader: timestamp, nowSeconds: 1762455715 };
    expect(await verifyCaktoWebhook({ ...base, signatureHeader: `v1=${signature}` })).toBe(true);
    expect(await verifyCaktoWebhook({ ...base, signatureHeader: `v2=zzz, v1=${signature}` })).toBe(true);
    expect(await verifyCaktoWebhook({ ...base, signatureHeader: 'v1=00' })).toBe(false);
    expect(await verifyCaktoWebhook({ ...base, signatureHeader: `v1=${signature}`, nowSeconds: 1762455715 + 301 })).toBe(false);
    expect(await verifyCaktoWebhook({ ...base, rawBody: `${rawBody} `, signatureHeader: `v1=${signature}` })).toBe(false);
  });

  it('refuses everything without a configured secret', async () => {
    expect(await verifyCaktoWebhook({ rawBody, secret: '', signatureHeader: null, timestampHeader: null })).toBe(false);
  });
});

describe('cakto event parsing', () => {
  it('extracts the order without keeping document or card data', () => {
    const [event] = parseCaktoEvents(JSON.parse(rawBody));
    expect(event).toMatchObject({
      event: 'purchase_approved',
      orderId: order.id,
      subscriptionId: 'sub-1',
      offerId: 'a8BcHrY',
      buyerEmail: 'maria@example.com',
      buyerPhone: '5579998426046',
    });
    expect(JSON.stringify(event.summary)).not.toMatch(/12345678909|4242|secret/);
  });

  it('reads webhook V2 lists and ignores checkout abandonment', () => {
    expect(parseCaktoEvents({ event: 'refund', data: [order, { ...order, id: 'o2' }] })).toHaveLength(2);
    expect(parseCaktoEvents({ event: 'checkout_abandonment', data: { customerEmail: 'a@b.c' } })).toEqual([]);
    expect(parseCaktoEvents({ event: 'refund', data: null })).toEqual([]);
  });
});

describe('extension version check', () => {
  it.each([
    ['1.1.0', '1.1.0', 0],
    ['1.2', '1.1.9', 1],
    ['1.0.9', '1.1.0', -1],
  ])('compares %s with %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
