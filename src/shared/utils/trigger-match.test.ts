import { describe, expect, it } from 'vitest';
import type { AutomationTrigger } from '../types';
import { findMatchingTrigger, matchesKeyword, normalizeTriggerText, parseKeywords } from './trigger-match';

const createTrigger = (overrides: Partial<AutomationTrigger> = {}): AutomationTrigger => ({
  id: 'trigger-1',
  name: 'Preço',
  keywords: ['preço'],
  matchMode: 'contains',
  action: { type: 'audio', contentId: 'audio-1' },
  enabled: true,
  replyDelaySeconds: 5,
  cooldownHours: 24,
  allowGroups: false,
  fireCount: 0,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('trigger keyword matching', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeTriggerText('  Qual o PREÇO???  ')).toBe('qual o preco');
  });

  it('matches whole words and phrases inside the message', () => {
    expect(matchesKeyword('Oi, qual o preço do curso?', 'preco', 'contains')).toBe(true);
    expect(matchesKeyword('Quero saber o valor do curso', 'valor do curso', 'contains')).toBe(true);
    expect(matchesKeyword('O boi fugiu', 'oi', 'contains')).toBe(false);
    expect(matchesKeyword('precos', 'preço', 'contains')).toBe(false);
  });

  it('requires the whole message in exact mode', () => {
    expect(matchesKeyword('Catálogo!', 'catalogo', 'exact')).toBe(true);
    expect(matchesKeyword('me manda o catálogo', 'catalogo', 'exact')).toBe(false);
  });

  it('ignores empty keywords and messages', () => {
    expect(matchesKeyword('', 'preço', 'contains')).toBe(false);
    expect(matchesKeyword('preço', '!!', 'contains')).toBe(false);
  });

  it('parses keywords split by commas or lines without duplicates', () => {
    expect(parseKeywords('preço, Preco\nvalor,, ')).toEqual(['Preco', 'valor']);
  });

  it('picks the oldest enabled trigger and skips groups by default', () => {
    const triggers = [
      createTrigger({ id: 'new', createdAt: 5, keywords: ['curso'] }),
      createTrigger({ id: 'disabled', createdAt: 1, enabled: false, keywords: ['curso'] }),
      createTrigger({ id: 'old', createdAt: 2, keywords: ['curso', 'preço'] }),
    ];
    expect(findMatchingTrigger(triggers, { text: 'Preço do curso?', isGroup: false })?.id).toBe('old');
    expect(findMatchingTrigger(triggers, { text: 'Preço do curso?', isGroup: true })).toBeUndefined();
    expect(findMatchingTrigger([createTrigger({ allowGroups: true })], { text: 'preço', isGroup: true })?.id).toBe('trigger-1');
  });
});
