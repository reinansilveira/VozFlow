import { describe, expect, it } from 'vitest';
import type { TriggerFiring } from '../types';
import { evaluateTriggerFiring, hasAutomationPlan, hourMs, normalizeAutomationSettings } from './automation-rules';

const now = new Date('2026-11-05T15:00:00').getTime();
const settings = normalizeAutomationSettings({ paused: false, triggerDailyLimit: 3 });
const trigger = { id: 'trigger-1', cooldownHours: 24 };

const firing = (overrides: Partial<TriggerFiring>): TriggerFiring => ({
  id: crypto.randomUUID(),
  triggerId: 'trigger-1',
  chatId: '5511999990000@c.us',
  chatName: 'Maria',
  firedAt: now - hourMs,
  status: 'sent',
  ...overrides,
});

describe('trigger deduplication and limits', () => {
  it('blocks the same trigger for the same chat inside the cooldown', () => {
    const decision = evaluateTriggerFiring({ trigger, chatId: '5511999990000@c.us', firings: [firing({})], settings, now });
    expect(decision).toEqual({ allowed: false, reason: 'cooldown' });
  });

  it('counts failed firings for the cooldown too', () => {
    const decision = evaluateTriggerFiring({ trigger, chatId: '5511999990000@c.us', firings: [firing({ status: 'error' })], settings, now });
    expect(decision.allowed).toBe(false);
  });

  it('allows the trigger again after the cooldown, for other chats and other triggers', () => {
    expect(evaluateTriggerFiring({ trigger, chatId: '5511999990000@c.us', firings: [firing({ firedAt: now - 25 * hourMs })], settings, now }).allowed).toBe(true);
    expect(evaluateTriggerFiring({ trigger, chatId: 'outro@c.us', firings: [firing({})], settings, now }).allowed).toBe(true);
    expect(evaluateTriggerFiring({ trigger, chatId: '5511999990000@c.us', firings: [firing({ triggerId: 'other' })], settings, now }).allowed).toBe(true);
  });

  it('respects the global daily limit and the general pause', () => {
    const today = [1, 2, 3].map((index) => firing({ chatId: `chat-${index}@c.us`, triggerId: `t-${index}` }));
    expect(evaluateTriggerFiring({ trigger, chatId: 'new@c.us', firings: today, settings, now })).toEqual({ allowed: false, reason: 'daily_limit' });
    const yesterday = today.map((item) => ({ ...item, firedAt: now - 20 * hourMs }));
    expect(evaluateTriggerFiring({ trigger, chatId: 'new@c.us', firings: yesterday, settings, now }).allowed).toBe(true);
    expect(evaluateTriggerFiring({ trigger, chatId: 'new@c.us', firings: [], settings: { ...settings, paused: true }, now })).toEqual({ allowed: false, reason: 'paused' });
  });

  it('clamps invalid settings', () => {
    expect(normalizeAutomationSettings({ triggerDailyLimit: 0 })).toEqual({ paused: false, triggerDailyLimit: 1 });
    expect(normalizeAutomationSettings(undefined)).toEqual({ paused: false, triggerDailyLimit: 50 });
  });
});

describe('automation plan', () => {
  it('is available on the trial and on Pro licenses only', () => {
    expect(hasAutomationPlan({ state: 'teste_ativo', plan: 'Teste grátis' })).toBe(true);
    expect(hasAutomationPlan({ state: 'licenca_ativa', plan: 'Pro anual' })).toBe(true);
    expect(hasAutomationPlan({ state: 'licenca_ativa', plan: 'Essencial mensal' })).toBe(false);
    expect(hasAutomationPlan({ state: 'licenca_suspensa', plan: 'Pro' })).toBe(false);
    expect(hasAutomationPlan({ state: 'licenca_ativa', plan: 'Profissional' })).toBe(false);
    expect(hasAutomationPlan(null)).toBe(false);
  });
});
