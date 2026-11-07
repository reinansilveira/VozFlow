import type { AudioItem, DocumentItem, Funnel, FunnelStep, ImageItem, ScheduleStep, TextItem } from '../types';
import { maxScheduledBinaryBytes } from '../utils/message-transport';

export type ScheduleLibrary = {
  audios: AudioItem[];
  images: ImageItem[];
  texts: TextItem[];
  documents: DocumentItem[];
  funnels: Funnel[];
};

export type ScheduleContentSnapshot = {
  name: string;
  type: 'text' | 'funnel';
  steps: ScheduleStep[];
};

const copyBytes = (bytes: ArrayBuffer): ArrayBuffer => bytes.slice(0);

const assertScheduledFileSize = (bytes: ArrayBuffer, name: string): void => {
  if (bytes.byteLength > maxScheduledBinaryBytes) {
    throw new Error(`“${name}” ultrapassa o limite de 40 MB para agendamentos.`);
  }
};

// Copia o conteúdo das etapas da biblioteca, para que mudanças futuras não alterem envios já confirmados.
export const buildStepsFromSources = (sources: FunnelStep[], library: ScheduleLibrary, ownerLabel: string): ScheduleStep[] => sources.map<ScheduleStep>((step) => {
  if (step.type === 'text') return { type: 'text', text: step.text || '', delaySeconds: step.delaySeconds };
  if (step.type === 'audio') {
    const audio = library.audios.find((item) => item.id === step.contentId);
    if (!audio) throw new Error(`O áudio de uma etapa ${ownerLabel} não existe mais.`);
    assertScheduledFileSize(audio.bytes, audio.name);
    return { type: 'audio', name: audio.name, bytes: copyBytes(audio.bytes), delaySeconds: step.delaySeconds };
  }
  if (step.type === 'image') {
    const image = library.images.find((item) => item.id === step.contentId);
    if (!image) throw new Error(`A imagem de uma etapa ${ownerLabel} não existe mais.`);
    assertScheduledFileSize(image.bytes, image.name);
    return { type: 'image', name: image.name, mimeType: image.mimeType, bytes: copyBytes(image.bytes), delaySeconds: step.delaySeconds };
  }
  const document = library.documents.find((item) => item.id === step.contentId);
  if (!document) throw new Error(`O documento de uma etapa ${ownerLabel} não existe mais.`);
  assertScheduledFileSize(document.bytes, document.name);
  return { type: 'document', name: document.name, fileName: document.fileName, mimeType: document.mimeType, bytes: copyBytes(document.bytes), delaySeconds: step.delaySeconds };
});

export const buildScheduleContent = (contentKey: string, library: ScheduleLibrary): ScheduleContentSnapshot => {
  const [contentType, contentId] = contentKey.split(':');
  if (contentType === 'text') {
    const text = library.texts.find((item) => item.id === contentId);
    if (!text) throw new Error('Selecione um texto válido.');
    return { name: text.name, type: 'text', steps: [{ type: 'text', text: text.text, delaySeconds: 0 }] };
  }

  if (contentType !== 'funnel') throw new Error('Selecione um texto ou funil.');
  const funnel = library.funnels.find((item) => item.id === contentId);
  if (!funnel) throw new Error('Selecione um funil válido.');

  const steps = buildStepsFromSources(funnel.steps, library, `do funil “${funnel.name}”`);
  return { name: funnel.name, type: 'funnel', steps };
};
