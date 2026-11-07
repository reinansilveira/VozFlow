import { describe, expect, it } from 'vitest';
import { activityTime, describeActivity, parseActivity, timeAgo } from './activity';

const now = Date.parse('2026-11-05T15:00:00Z');

describe('site activity notifications', () => {
  it('describes real subscriptions and trials without personal data', () => {
    expect(describeActivity({ kind: 'assinatura', plan: 'Pro', region: 'de Sergipe', at: '' })).toBe('Alguém de Sergipe assinou o plano Pro');
    expect(describeActivity({ kind: 'teste', plan: 'Teste grátis', region: null, at: '' })).toBe('Alguém começou o teste grátis');
  });

  it('formats how long ago it happened', () => {
    expect(timeAgo('2026-11-05T14:59:40Z', now)).toBe('agora mesmo');
    expect(timeAgo('2026-11-05T14:48:00Z', now)).toBe('há 12 min');
    expect(timeAgo('2026-11-05T12:00:00Z', now)).toBe('há 3 h');
    expect(timeAgo('2026-11-04T12:00:00Z', now)).toBe('há 1 dia');
  });

  it('reads events registered by hand in Brasília time', () => {
    const event = { kind: 'teste' as const, plan: 'Teste grátis', region: null, at: '2026-11-05 11:30' };
    expect(activityTime(event, new Date(now))).toBe('há 30 min');
  });

  it('keeps only well-formed events', () => {
    expect(parseActivity({ events: [
      { kind: 'assinatura', plan: 'Pro', region: 'da Bahia', at: '2026-11-05T14:00:00Z' },
      { kind: 'inventado', plan: 'x', region: null, at: '2026-11-05T14:00:00Z' },
      { kind: 'teste', plan: 'Teste grátis', region: null, at: 'ontem' },
    ] })).toHaveLength(1);
    expect(parseActivity(null)).toEqual([]);
  });
});
