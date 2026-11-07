import { describe, expect, it } from 'vitest';
import { eventForTrack } from './analytics';

describe('ad measurement events', () => {
  it('maps page clicks to the standard events of each platform', () => {
    expect(eventForTrack('teste')).toMatchObject({ meta: 'Lead', ga: 'generate_lead' });
    expect(eventForTrack('instalar')).toMatchObject({ meta: 'Lead', ga: 'generate_lead' });
    expect(eventForTrack('assinar', 'Pro')).toEqual({
      meta: 'InitiateCheckout', metaParams: { content_name: 'Pro' }, ga: 'begin_checkout', gaParams: { plano: 'Pro' },
    });
    expect(eventForTrack('whatsapp')).toMatchObject({ meta: 'Contact', ga: 'contact' });
    expect(eventForTrack('qualquer')).toBeNull();
  });
});
