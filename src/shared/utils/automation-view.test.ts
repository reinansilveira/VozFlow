import { describe, expect, it } from 'vitest';
import type { KnownContact } from '../types';
import { filterReactivationContacts, formatDelay, fromDelayParts, toDelayParts } from './automation-view';

const now = new Date('2026-11-06T12:00:00').getTime();
const day = 86_400_000;
const contact = (id: string, daysAgo: number, tags: string[] = []): KnownContact => ({ id, name: id, phone: '', tags, lastInboundAt: now - daysAgo * day, updatedAt: now });

describe('automation view helpers', () => {
  it('filters reactivation contacts by inactivity and tag', () => {
    const contacts = [contact('a', 10, ['lead']), contact('b', 2, ['lead']), contact('c', 30)];
    expect(filterReactivationContacts(contacts, { tag: '', inactiveDays: 7, now }).map((item) => item.id)).toEqual(['a', 'c']);
    expect(filterReactivationContacts(contacts, { tag: 'lead', inactiveDays: 7, now }).map((item) => item.id)).toEqual(['a']);
  });

  it('converts step delays between units', () => {
    expect(toDelayParts(172_800)).toEqual({ value: 2, unit: 'days' });
    expect(toDelayParts(7_200)).toEqual({ value: 2, unit: 'hours' });
    expect(toDelayParts(600)).toEqual({ value: 10, unit: 'minutes' });
    expect(fromDelayParts(3, 'hours')).toBe(10_800);
    expect(formatDelay(0)).toBe('na hora');
  });
});
