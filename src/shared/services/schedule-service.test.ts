import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledCampaign, ScheduledDelivery } from '../types';

type TestStoreName = 'campaigns' | 'deliveries';
type StoredRecord = { id: string };

const fakeIndexedDb = vi.hoisted(() => {
  const stores: Record<TestStoreName, Map<string, unknown>> = {
    campaigns: new Map(),
    deliveries: new Map(),
  };

  const getStore = (name: string): Map<string, unknown> => {
    if (name !== 'campaigns' && name !== 'deliveries') {
      throw new Error(`Unexpected test store: ${name}`);
    }
    return stores[name];
  };

  const clone = <T>(value: T): T => structuredClone(value);
  const database = {
    transaction: () => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        objectStore: (name: string) => ({
          add: (value: unknown) => {
            const item = value as StoredRecord;
            getStore(name).set(item.id, clone(value));
          },
          put: (value: unknown) => {
            const item = value as StoredRecord;
            getStore(name).set(item.id, clone(value));
          },
          delete: (id: string) => {
            getStore(name).delete(id);
          },
        }),
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
  };

  return {
    database,
    reset: () => {
      stores.campaigns.clear();
      stores.deliveries.clear();
    },
    seed: <T extends StoredRecord>(store: TestStoreName, value: T): void => {
      stores[store].set(value.id, clone(value));
    },
    read: <T>(store: TestStoreName, id: string): T | undefined => {
      const value = stores[store].get(id);
      return value === undefined ? undefined : clone(value as T);
    },
    readAll: <T>(store: TestStoreName): T[] => [...stores[store].values()].map((value) => clone(value as T)),
  };
});

vi.mock('./library-service', () => ({
  openLibrary: async () => fakeIndexedDb.database as unknown as IDBDatabase,
  getAllItems: async <T>(_database: IDBDatabase, store: TestStoreName): Promise<T[]> => fakeIndexedDb.readAll<T>(store),
  getItem: async <T>(_database: IDBDatabase, store: TestStoreName, id: string): Promise<T | undefined> => fakeIndexedDb.read<T>(store, id),
}));

import {
  acknowledgeDeliveryExecution,
  claimNextDueDelivery,
  finishDeliveryAttempt,
  recoverLegacyTransientDeliveries,
  recoverStaleDeliveries,
  retryDelivery,
} from './schedule-service';

const now = new Date('2026-10-10T12:00:00.000Z').getTime();

const createCampaign = (overrides: Partial<ScheduledCampaign> = {}): ScheduledCampaign => ({
  id: 'campaign-1',
  name: 'Campanha de teste',
  contentName: 'Mensagem de teste',
  contentType: 'text',
  steps: [{ type: 'text', text: 'Olá', delaySeconds: 0 }],
  status: 'scheduled',
  recipientCount: 1,
  dailyLimit: 5,
  intervalMinutes: 5,
  weekdaysOnly: false,
  timezone: 'America/Sao_Paulo',
  startsAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const createDelivery = (overrides: Partial<ScheduledDelivery> = {}): ScheduledDelivery => ({
  id: 'delivery-1',
  campaignId: 'campaign-1',
  recipient: {
    id: 'recipient-1',
    name: 'Contato',
    phone: '5579996293617',
    chatId: '5579996293617@c.us',
  },
  scheduledAt: now,
  dueAt: now,
  status: 'pending',
  currentStep: 0,
  totalSteps: 1,
  attemptCount: 0,
  ...overrides,
});

const seedSchedule = (
  campaign: ScheduledCampaign = createCampaign(),
  delivery: ScheduledDelivery = createDelivery(),
): void => {
  fakeIndexedDb.seed('campaigns', campaign);
  fakeIndexedDb.seed('deliveries', delivery);
};

describe('schedule service recovery', () => {
  beforeEach(() => {
    fakeIndexedDb.reset();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not exhaust the delivery attempt limit on repeated transient failures', async () => {
    seedSchedule();

    for (let failure = 0; failure < 5; failure += 1) {
      const claimed = await claimNextDueDelivery();
      expect(claimed?.delivery.status).toBe('processing');
      expect(claimed?.delivery.attemptCount).toBe(1);

      await finishDeliveryAttempt(
        'delivery-1',
        claimed!.delivery.executionId!,
        false,
        'O WhatsApp ainda está sincronizando a identificação da sua conta.',
      );

      const delivery = fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1');
      expect(delivery).toMatchObject({
        status: 'retrying',
        attemptCount: 0,
        lastFailureTransient: true,
      });

      vi.setSystemTime(delivery!.dueAt + 1);
    }

    expect(fakeIndexedDb.read<ScheduledCampaign>('campaigns', 'campaign-1')?.status).toBe('scheduled');
  });

  it('clears the previous failure when a retry is claimed', async () => {
    seedSchedule(createCampaign(), createDelivery({
      status: 'retrying',
      lastError: 'No LID for user',
      lastFailureTransient: true,
    }));

    const claimed = await claimNextDueDelivery();
    const persisted = fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1');

    expect(claimed?.delivery).toMatchObject({ status: 'processing', attemptCount: 1 });
    expect(claimed?.delivery.lastError).toBeUndefined();
    expect(claimed?.delivery.lastFailureTransient).toBeUndefined();
    expect(persisted?.lastError).toBeUndefined();
    expect(persisted?.lastFailureTransient).toBeUndefined();
  });

  it('quickly returns an unacknowledged dispatch to the queue after a WhatsApp reload', async () => {
    seedSchedule();
    const claimed = await claimNextDueDelivery();

    vi.advanceTimersByTime(30_001);
    await recoverStaleDeliveries();

    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')).toMatchObject({
      status: 'retrying',
      attemptCount: 0,
      lastFailureTransient: true,
      lastError: 'O executor do WhatsApp não confirmou o recebimento do envio. Tentaremos novamente.',
    });
    expect(claimed?.delivery.executionId).toBeTruthy();
  });

  it('keeps an acknowledged execution protected from recovery while WhatsApp confirms the send', async () => {
    seedSchedule();
    const claimed = await claimNextDueDelivery();
    await acknowledgeDeliveryExecution('delivery-1', claimed!.delivery.executionId!);

    vi.advanceTimersByTime(30_001);
    await recoverStaleDeliveries();

    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')).toMatchObject({
      status: 'processing',
      executionId: claimed!.delivery.executionId,
    });
  });

  it('ignores a late result from a dispatch replaced after the WhatsApp reload', async () => {
    seedSchedule();
    const firstClaim = await claimNextDueDelivery();
    vi.advanceTimersByTime(30_001);
    await recoverStaleDeliveries();
    const secondClaim = await claimNextDueDelivery();

    await finishDeliveryAttempt('delivery-1', firstClaim!.delivery.executionId!, true);

    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')).toMatchObject({
      status: 'processing',
      executionId: secondClaim!.delivery.executionId,
    });
  });

  it('resets the attempt budget when the user manually retries a failed delivery', async () => {
    seedSchedule(createCampaign({ status: 'completed' }), createDelivery({
      status: 'error',
      attemptCount: 3,
      executionStartedAt: now - 1_000,
      lastError: 'Falha definitiva anterior',
      lastFailureTransient: false,
    }));

    await retryDelivery('delivery-1');

    expect(fakeIndexedDb.read<ScheduledCampaign>('campaigns', 'campaign-1')?.status).toBe('scheduled');
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')).toMatchObject({
      status: 'retrying',
      dueAt: now,
      attemptCount: 0,
    });
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')?.executionStartedAt).toBeUndefined();
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')?.lastError).toBeUndefined();
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')?.lastFailureTransient).toBeUndefined();
  });

  it('recovers a legacy terminal No LID failure as an immediate retry', async () => {
    seedSchedule(createCampaign({ status: 'completed' }), createDelivery({
      status: 'error',
      attemptCount: 3,
      lastError: 'No LID for user',
    }));

    await recoverLegacyTransientDeliveries();

    expect(fakeIndexedDb.read<ScheduledCampaign>('campaigns', 'campaign-1')).toMatchObject({
      status: 'scheduled',
      updatedAt: now,
    });
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1')).toMatchObject({
      status: 'retrying',
      dueAt: now,
      attemptCount: 0,
      lastError: 'No LID for user',
      lastFailureTransient: true,
    });
  });
});

describe('remarketing on the schedule queue', () => {
  beforeEach(() => {
    fakeIndexedDb.reset();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const remarketingCampaign = (): ScheduledCampaign => createCampaign({
    kind: 'remarketing',
    contentType: 'funnel',
    dailyLimit: 20,
    intervalMinutes: 10,
    steps: [
      { type: 'text', text: 'Oi de novo', delaySeconds: 0 },
      { type: 'text', text: 'Ainda tem interesse?', delaySeconds: 86_400 },
    ],
  });

  it('stops the flow after the current step when the contact replied during the send', async () => {
    seedSchedule(remarketingCampaign(), createDelivery({ totalSteps: 2, enrolledAt: now - 1_000 }));
    const claimed = await claimNextDueDelivery();
    fakeIndexedDb.seed('deliveries', { ...claimed!.delivery, exitRequestedAt: now, exitReason: 'replied' });

    await finishDeliveryAttempt('delivery-1', claimed!.delivery.executionId!, true);

    const delivery = fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'delivery-1');
    expect(delivery).toMatchObject({ status: 'cancelled', exitReason: 'replied', currentStep: 1, lastStepSentAt: now });
  });

  it('defers a due enrollment while another person was contacted inside the interval', async () => {
    const campaign = remarketingCampaign();
    fakeIndexedDb.seed('campaigns', campaign);
    fakeIndexedDb.seed('deliveries', createDelivery({ id: 'sent-recently', status: 'pending', currentStep: 1, totalSteps: 2, dueAt: now + 86_400_000, lastStepSentAt: now - 2 * 60_000 }));
    fakeIndexedDb.seed('deliveries', createDelivery({ id: 'waiting', totalSteps: 2, recipient: { id: 'r2', name: 'Outro', phone: '5511999990000', chatId: '5511999990000@c.us' } }));

    expect(await claimNextDueDelivery()).toBeUndefined();
    expect(fakeIndexedDb.read<ScheduledDelivery>('deliveries', 'waiting')).toMatchObject({ status: 'pending', dueAt: now + 8 * 60_000, attemptCount: 0 });
  });

  it('never claims remarketing deliveries when the background holds automation', async () => {
    seedSchedule(remarketingCampaign(), createDelivery({ totalSteps: 2 }));
    expect(await claimNextDueDelivery((campaign) => campaign.kind !== 'remarketing')).toBeUndefined();
  });

  it('does not complete a remarketing flow when every enrollment finished', async () => {
    seedSchedule(remarketingCampaign(), createDelivery({ totalSteps: 1 }));
    const claimed = await claimNextDueDelivery();
    await finishDeliveryAttempt('delivery-1', claimed!.delivery.executionId!, true);
    expect(fakeIndexedDb.read<ScheduledCampaign>('campaigns', 'campaign-1')?.status).toBe('scheduled');
  });
});
