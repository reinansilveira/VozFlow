import { describe, expect, it } from 'vitest';
import { regionFromDdd } from './region';

describe('region from DDD', () => {
  it.each([
    ['79', 'de Sergipe'],
    ['11', 'de São Paulo'],
    ['21', 'do Rio de Janeiro'],
    ['71', 'da Bahia'],
    ['61', 'do Distrito Federal'],
  ])('maps %s to %s', (ddd, region) => {
    expect(regionFromDdd(ddd)).toBe(region);
  });

  it('ignores unknown or malformed codes', () => {
    expect(regionFromDdd('20')).toBeNull();
    expect(regionFromDdd('7')).toBeNull();
    expect(regionFromDdd(null)).toBeNull();
  });
});
