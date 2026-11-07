import { getAllItems, getItem, markItemUsed, type StoreName } from './library-service';
import type { AudioItem, DocumentItem, ExtensionMessage, Funnel, ImageItem, TextItem } from '../types';

export type ShortcutKind = 'funnels' | 'audios' | 'images' | 'texts' | 'documents';

export type ShortcutItem = {
  id: string;
  kind: ShortcutKind;
  name: string;
  detail: string;
  durationSeconds: number;
  usageCount: number;
  lastUsedAt: number;
  createdAt: number;
};

export type ShortcutGroups = Record<ShortcutKind, ShortcutItem[]>;

const shortcutKindPriority: Record<ShortcutKind, number> = {
  funnels: 0,
  audios: 1,
  images: 2,
  texts: 3,
  documents: 4,
};

const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const sortByUsage = <T extends { createdAt: number; usageCount?: number; lastUsedAt?: number }>(items: T[]): T[] => [...items].sort((first, second) => {
  const usageDifference = (second.usageCount || 0) - (first.usageCount || 0);
  if (usageDifference !== 0) return usageDifference;
  const recencyDifference = (second.lastUsedAt || 0) - (first.lastUsedAt || 0);
  return recencyDifference || second.createdAt - first.createdAt;
});

export const getShortcutGroups = async (database: IDBDatabase, limit = 5): Promise<ShortcutGroups> => {
  const [funnels, audios, images, texts, documents] = await Promise.all([
    getAllItems<Funnel>(database, 'funnels'),
    getAllItems<AudioItem>(database, 'audios'),
    getAllItems<ImageItem>(database, 'images'),
    getAllItems<TextItem>(database, 'texts'),
    getAllItems<DocumentItem>(database, 'documents'),
  ]);

  return {
    funnels: sortByUsage(funnels).slice(0, limit).map((item) => ({ id: item.id, kind: 'funnels', name: item.name, detail: `${item.steps.length} etapa${item.steps.length === 1 ? '' : 's'}`, durationSeconds: item.steps.reduce((total, step) => total + step.delaySeconds, 0), usageCount: item.usageCount || 0, lastUsedAt: item.lastUsedAt || 0, createdAt: item.createdAt })),
    audios: sortByUsage(audios).slice(0, limit).map((item) => ({ id: item.id, kind: 'audios', name: item.name, detail: item.duration ? `${Math.ceil(item.duration)}s · OGG/Opus` : 'Áudio OGG/Opus', durationSeconds: Math.ceil(item.duration || 0), usageCount: item.usageCount || 0, lastUsedAt: item.lastUsedAt || 0, createdAt: item.createdAt })),
    images: sortByUsage(images).slice(0, limit).map((item) => ({ id: item.id, kind: 'images', name: item.name, detail: item.mimeType.replace('image/', '').toUpperCase(), durationSeconds: 0, usageCount: item.usageCount || 0, lastUsedAt: item.lastUsedAt || 0, createdAt: item.createdAt })),
    texts: sortByUsage(texts).slice(0, limit).map((item) => ({ id: item.id, kind: 'texts', name: item.name, detail: item.text, durationSeconds: 0, usageCount: item.usageCount || 0, lastUsedAt: item.lastUsedAt || 0, createdAt: item.createdAt })),
    documents: sortByUsage(documents).slice(0, limit).map((item) => ({ id: item.id, kind: 'documents', name: item.name, detail: `${item.fileName.split('.').pop()?.toUpperCase() || 'Arquivo'} · ${formatFileSize(item.size)}`, durationSeconds: 0, usageCount: item.usageCount || 0, lastUsedAt: item.lastUsedAt || 0, createdAt: item.createdAt })),
  };
};

export const getTopShortcuts = (groups: ShortcutGroups, limit = 3): ShortcutItem[] => Object.values(groups).flat().sort((first, second) => {
  const kindDifference = shortcutKindPriority[first.kind] - shortcutKindPriority[second.kind];
  if (kindDifference !== 0) return kindDifference;
  const usageDifference = second.usageCount - first.usageCount;
  if (usageDifference !== 0) return usageDifference;
  return second.lastUsedAt - first.lastUsedAt || second.createdAt - first.createdAt;
}).slice(0, limit);

const prepareFunnel = async (database: IDBDatabase, funnel: Funnel): Promise<ExtensionMessage> => {
  const [audios, images, documents] = await Promise.all([
    getAllItems<AudioItem>(database, 'audios'),
    getAllItems<ImageItem>(database, 'images'),
    getAllItems<DocumentItem>(database, 'documents'),
  ]);
  const steps = funnel.steps.map((step) => {
    if (step.type === 'text') return { ...step, delayMs: step.delaySeconds * 1000 };
    const media = step.type === 'image'
      ? images.find((item) => item.id === step.contentId)
      : step.type === 'document'
        ? documents.find((item) => item.id === step.contentId)
        : audios.find((item) => item.id === step.contentId);
    if (!media) throw new Error('Uma mídia deste funil foi removida.');
    const fileName = step.type === 'document' ? (media as DocumentItem).fileName : undefined;
    return {
      ...step,
      delayMs: step.delaySeconds * 1000,
      name: media.name,
      bytes: media.bytes.slice(0),
      ...('mimeType' in media ? { mimeType: media.mimeType } : {}),
      ...(fileName ? { fileName } : {}),
    };
  });
  return { type: 'START_FUNNEL', jobId: crypto.randomUUID(), steps };
};

export const prepareShortcutMessage = async (database: IDBDatabase, shortcut: ShortcutItem): Promise<ExtensionMessage> => {
  if (shortcut.kind === 'audios') {
    const audio = await getItem<AudioItem>(database, 'audios', shortcut.id);
    if (!audio) throw new Error('Este áudio não está mais disponível.');
    return { type: 'SEND_AUDIO', audio: { name: audio.name, bytes: audio.bytes.slice(0) } };
  }
  if (shortcut.kind === 'images') {
    const image = await getItem<ImageItem>(database, 'images', shortcut.id);
    if (!image) throw new Error('Esta imagem não está mais disponível.');
    return { type: 'SEND_IMAGE', image: { name: image.name, mimeType: image.mimeType, bytes: image.bytes.slice(0) } };
  }
  if (shortcut.kind === 'texts') {
    const text = await getItem<TextItem>(database, 'texts', shortcut.id);
    if (!text) throw new Error('Esta mensagem não está mais disponível.');
    return { type: 'SEND_TEXT', text: { name: text.name, text: text.text } };
  }
  if (shortcut.kind === 'documents') {
    const document = await getItem<DocumentItem>(database, 'documents', shortcut.id);
    if (!document) throw new Error('Este documento não está mais disponível.');
    return { type: 'SEND_DOCUMENT', document: { name: document.name, fileName: document.fileName, mimeType: document.mimeType, bytes: document.bytes.slice(0) } };
  }
  const funnel = await getItem<Funnel>(database, 'funnels', shortcut.id);
  if (!funnel) throw new Error('Este funil não está mais disponível.');
  return prepareFunnel(database, funnel);
};

export const registerShortcutUse = async (database: IDBDatabase, shortcut: ShortcutItem): Promise<void> => {
  const item = await getItem<{ id: string; usageCount?: number; lastUsedAt?: number }>(database, shortcut.kind as StoreName, shortcut.id);
  if (item) await markItemUsed(database, shortcut.kind as StoreName, item);
};
