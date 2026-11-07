import { describe, expect, it } from 'vitest';
import type { ScheduleStep } from '../types';
import {
  deserializeScheduledCampaign,
  deserializeScheduleStep,
  maxScheduledBinaryBytes,
  serializeScheduledCampaign,
  serializeScheduleStep,
} from './message-transport';

const bytesOf = (buffer: ArrayBuffer): number[] => [...new Uint8Array(buffer)];

describe('scheduled message transport', () => {
  it('keeps text steps JSON serializable without adding binary fields', () => {
    const step: ScheduleStep = { type: 'text', text: 'Olá', delaySeconds: 0 };
    const serialized = serializeScheduleStep(step);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(step);
    expect(deserializeScheduleStep(serialized)).toEqual(step);
  });

  it('round-trips media bytes through a JSON-only extension message', () => {
    const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]).buffer;
    const step: ScheduleStep = {
      type: 'image',
      name: 'Imagem de teste',
      mimeType: 'image/png',
      bytes,
      delaySeconds: 5,
    };

    const transported = JSON.parse(JSON.stringify(serializeScheduleStep(step))) as ReturnType<typeof serializeScheduleStep>;
    expect(transported).not.toHaveProperty('bytes');
    expect(bytesOf(deserializeScheduleStep(transported).bytes as ArrayBuffer)).toEqual(bytesOf(bytes));
  });

  it('preserves campaign media bytes through the JSON-only panel-to-background message', () => {
    const bytes = Uint8Array.from([79, 103, 103, 83, 1, 2, 3]).buffer;
    const campaign = {
      id: 'campaign-audio',
      name: 'Áudio de boas-vindas',
      contentName: 'Funil de boas-vindas',
      contentType: 'funnel' as const,
      steps: [{ type: 'audio' as const, name: 'Boas-vindas', bytes, delaySeconds: 0 }],
      status: 'scheduled' as const,
      recipientCount: 1,
      dailyLimit: 5,
      intervalMinutes: 5,
      weekdaysOnly: false,
      timezone: 'America/Sao_Paulo',
      startsAt: 0,
      createdAt: 0,
      updatedAt: 0,
    };

    const transported = JSON.parse(JSON.stringify(serializeScheduledCampaign(campaign)));
    const restored = deserializeScheduledCampaign(transported);

    expect(bytesOf(restored.steps[0].bytes as ArrayBuffer)).toEqual(bytesOf(bytes));
  });

  it('rejects an empty media file before WhatsApp can report MediaFileEmpty', () => {
    expect(() => serializeScheduleStep({ type: 'audio', bytes: new ArrayBuffer(0), delaySeconds: 0 }))
      .toThrow('está vazio');
  });

  it('rejects files larger than the scheduler transport limit', () => {
    const oversized = new ArrayBuffer(maxScheduledBinaryBytes + 1);
    expect(() => serializeScheduleStep({ type: 'document', bytes: oversized, delaySeconds: 0 }))
      .toThrow('ultrapassa 40 MB');
  });
});
