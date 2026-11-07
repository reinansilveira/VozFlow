import type { ScheduleStep, ScheduledCampaign, SerializedScheduleStep, SerializedScheduledCampaign } from '../types';

export type { SerializedScheduleStep } from '../types';

export const maxScheduledBinaryBytes = 40 * 1024 * 1024;
const encodingChunkSize = 32 * 1024;

export const encodeArrayBuffer = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < view.length; offset += encodingChunkSize) {
    binary += String.fromCharCode(...view.subarray(offset, offset + encodingChunkSize));
  }
  return btoa(binary);
};

export const decodeArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const view = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) view[index] = binary.charCodeAt(index);
  return view.buffer;
};

export const serializeScheduleStep = (step: ScheduleStep): SerializedScheduleStep => {
  const { bytes, ...metadata } = step;
  if (!bytes) return metadata;
  if (!(bytes instanceof ArrayBuffer)) {
    throw new Error('O arquivo desta campanha não está mais disponível. Crie a campanha novamente a partir da biblioteca.');
  }
  if (bytes.byteLength === 0) {
    throw new Error('O arquivo desta campanha está vazio. Crie a campanha novamente a partir da biblioteca.');
  }
  if (bytes.byteLength > maxScheduledBinaryBytes) {
    throw new Error('O arquivo desta etapa ultrapassa 40 MB e não pode ser enviado pelo agendador.');
  }
  return { ...metadata, bytesBase64: encodeArrayBuffer(bytes) };
};

export const deserializeScheduleStep = (step: SerializedScheduleStep): ScheduleStep => {
  const { bytesBase64, ...metadata } = step;
  return bytesBase64 === undefined ? metadata : { ...metadata, bytes: decodeArrayBuffer(bytesBase64) };
};

export const serializeScheduledCampaign = (campaign: ScheduledCampaign): SerializedScheduledCampaign => ({
  ...campaign,
  steps: campaign.steps.map(serializeScheduleStep),
});

export const deserializeScheduledCampaign = (campaign: SerializedScheduledCampaign): ScheduledCampaign => ({
  ...campaign,
  steps: campaign.steps.map(deserializeScheduleStep),
});
