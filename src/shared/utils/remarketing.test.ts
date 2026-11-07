import { describe, expect, it } from 'vitest';
import type { KnownContact, ScheduledCampaign, ScheduledDelivery } from '../types';
import {
  adaptDeliveryToFlow,
  applyEnrollmentExit,
  getRemarketingDeferral,
  planEnrollments,
  selectDeliveriesToExit,
} from './remarketing';

const now = new Date('2026-11-05T15:00:00').getTime();
let sequence = 0;
const createId = (): string => `id-${(sequence += 1)}`;

const flow = (overrides: Partial<ScheduledCampaign> = {}): ScheduledCampaign => ({
  id: 'flow-1',
  kind: 'remarketing',
  name: 'Reativação',
  contentName: 'Reativação',
  contentType: 'funnel',
  steps: [{ type: 'text', text: 'Oi!', delaySeconds: 3_600 }, { type: 'text', text: 'Ainda aí?', delaySeconds: 86_400 }],
  status: 'scheduled',
  recipientCount: 0,
  dailyLimit: 2,
  intervalMinutes: 10,
  weekdaysOnly: false,
  timezone: 'America/Sao_Paulo',
  startsAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const contact = (overrides: Partial<KnownContact> = {}): KnownContact => ({
  id: '5511999990000@c.us',
  name: 'Maria',
  phone: '5511999990000',
  tags: [],
  lastInboundAt: now - 86_400_000,
  updatedAt: now,
  ...overrides,
});

const enrollment = (overrides: Partial<ScheduledDelivery> = {}): ScheduledDelivery => ({
  id: 'delivery-1',
  campaignId: 'flow-1',
  recipient: { id: 'r1', name: 'Maria', phone: '5511999990000', chatId: '5511999990000@c.us' },
  scheduledAt: now,
  dueAt: now,
  status: 'pending',
  currentStep: 0,
  totalSteps: 2,
  attemptCount: 0,
  enrolledAt: now - 60_000,
  enrolledChatId: '5511999990000@c.us',
  ...overrides,
});

describe('remarketing enrollment', () => {
  it('enrolls known contacts with the first step delay', () => {
    const plan = planEnrollments({ campaign: flow(), chatIds: ['5511999990000@c.us'], contacts: [contact()], existingDeliveries: [], source: 'manual', now, createId });
    expect(plan.skipped).toEqual([]);
    expect(plan.deliveries[0]).toMatchObject({ status: 'pending', dueAt: now + 3_600_000, enrolledAt: now, totalSteps: 2, enrollmentSource: 'manual' });
  });

  it('rejects contacts who never sent a message and groups', () => {
    const plan = planEnrollments({
      campaign: flow(),
      chatIds: ['desconhecido@c.us', '123@g.us'],
      contacts: [contact({ id: '123@g.us' })],
      existingDeliveries: [],
      source: 'reactivation',
      now,
      createId,
    });
    expect(plan.deliveries).toEqual([]);
    expect(plan.skipped.map((item) => item.reason)).toEqual([
      'Só entram contatos que já enviaram mensagem para você.',
      'Grupos não entram em fluxos de remarketing.',
    ]);
  });

  it('prevents a second active enrollment in the same flow, also through the resolved LID', () => {
    const active = enrollment({ recipient: { id: 'r1', name: 'Maria', phone: '5511999990000', chatId: '9988@lid' } });
    const plan = planEnrollments({ campaign: flow(), chatIds: ['5511999990000@c.us', '5511999990000@c.us'], contacts: [contact()], existingDeliveries: [active], source: 'trigger', now, createId });
    expect(plan.deliveries).toEqual([]);
    expect(plan.skipped).toEqual([{ name: 'Maria', reason: 'Já está neste fluxo.' }]);
  });

  it('allows a new enrollment after the previous one ended and starts paused flows paused', () => {
    const finished = enrollment({ status: 'cancelled', exitReason: 'replied' });
    const plan = planEnrollments({ campaign: flow({ status: 'paused' }), chatIds: ['5511999990000@c.us'], contacts: [contact()], existingDeliveries: [finished], source: 'manual', now, createId });
    expect(plan.deliveries[0]?.status).toBe('paused');
  });
});

describe('remarketing exit', () => {
  it('selects active enrollments of the contact that entered before the reply', () => {
    const deliveries = [
      enrollment({ id: 'active' }),
      enrollment({ id: 'by-phone', recipient: { id: 'r2', name: 'Maria', phone: '5511999990000', chatId: '9988@lid' }, enrolledChatId: '9988@lid' }),
      enrollment({ id: 'after-reply', enrolledAt: now + 1_000 }),
      enrollment({ id: 'done', status: 'sent' }),
      enrollment({ id: 'other-contact', recipient: { id: 'r3', name: 'João', phone: '5511888880000', chatId: '5511888880000@c.us' }, enrolledChatId: '5511888880000@c.us' }),
      enrollment({ id: 'schedule', campaignId: 'schedule-1' }),
    ];
    const selected = selectDeliveriesToExit({
      deliveries,
      campaigns: [flow(), flow({ id: 'schedule-1', kind: 'schedule' })],
      chatKeys: ['5511999990000@c.us'],
      messageAt: now,
    });
    expect(selected.map((delivery) => delivery.id)).toEqual(['active', 'by-phone']);
  });

  it('cancels waiting enrollments and lets the one being sent finish its current step', () => {
    expect(applyEnrollmentExit(enrollment(), now)).toMatchObject({ status: 'cancelled', exitReason: 'replied', exitRequestedAt: now });
    expect(applyEnrollmentExit(enrollment({ status: 'processing', executionId: 'x' }), now)).toMatchObject({ status: 'processing', exitReason: 'replied', executionId: 'x' });
  });
});

describe('remarketing limits', () => {
  const other = (id: string, lastStepSentAt: number): ScheduledDelivery => enrollment({ id, lastStepSentAt, recipient: { id, name: id, phone: '', chatId: `${id}@c.us` } });

  it('waits for the interval between different people', () => {
    const deferral = getRemarketingDeferral({ campaign: flow(), delivery: enrollment(), campaignDeliveries: [other('a', now - 4 * 60_000)], now });
    expect(deferral).toBe(now + 6 * 60_000);
  });

  it('moves to the next day when the daily limit of people was reached', () => {
    const deferral = getRemarketingDeferral({ campaign: flow(), delivery: enrollment(), campaignDeliveries: [other('a', now - 60 * 60_000), other('b', now - 30 * 60_000)], now });
    expect(deferral).toBe(new Date('2026-11-06T00:00:00').getTime());
  });

  it('lets the step go when limits allow it', () => {
    expect(getRemarketingDeferral({ campaign: flow(), delivery: enrollment(), campaignDeliveries: [other('a', now - 60 * 60_000)], now })).toBeUndefined();
    expect(getRemarketingDeferral({ campaign: flow(), delivery: enrollment(), campaignDeliveries: [], now })).toBeUndefined();
  });

  it('completes enrollments that are past the last step after an edit', () => {
    expect(adaptDeliveryToFlow(enrollment({ currentStep: 2, totalSteps: 3 }), 2, now)).toMatchObject({ status: 'sent', totalSteps: 2 });
    expect(adaptDeliveryToFlow(enrollment({ currentStep: 1 }), 3, now)).toMatchObject({ status: 'pending', totalSteps: 3 });
  });
});
