import type { AudioItem, DocumentItem, Funnel, ImageItem, TextItem } from '../types';

const databaseName = 'vozflow-library';
const databaseVersion = 5;
const stores = ['audios', 'images', 'texts', 'documents', 'funnels', 'campaigns', 'deliveries', 'triggers', 'triggerFirings', 'contacts'] as const;
export type StoreName = (typeof stores)[number];

export const openLibrary = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(databaseName, databaseVersion);

  request.onupgradeneeded = () => {
    const database = request.result;
    stores.forEach((store) => {
      if (!database.objectStoreNames.contains(store)) {
        database.createObjectStore(store, { keyPath: 'id' });
      }
    });
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const getAllItems = <T>(database: IDBDatabase, store: StoreName): Promise<T[]> => new Promise((resolve, reject) => {
  const request = database.transaction(store, 'readonly').objectStore(store).getAll();
  request.onsuccess = () => resolve(request.result as T[]);
  request.onerror = () => reject(request.error);
});

export const getItem = <T>(database: IDBDatabase, store: StoreName, id: string): Promise<T | undefined> => new Promise((resolve, reject) => {
  const request = database.transaction(store, 'readonly').objectStore(store).get(id);
  request.onsuccess = () => resolve(request.result as T | undefined);
  request.onerror = () => reject(request.error);
});

export const saveItem = <T>(database: IDBDatabase, store: StoreName, item: T): Promise<void> => new Promise((resolve, reject) => {
  const request = database.transaction(store, 'readwrite').objectStore(store).put(item);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

export const removeItem = (database: IDBDatabase, store: StoreName, id: string): Promise<void> => new Promise((resolve, reject) => {
  const request = database.transaction(store, 'readwrite').objectStore(store).delete(id);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

export const markItemUsed = async <T extends { id: string; usageCount?: number; lastUsedAt?: number }>(database: IDBDatabase, store: StoreName, item: T): Promise<void> => {
  await saveItem(database, store, {
    ...item,
    usageCount: (item.usageCount || 0) + 1,
    lastUsedAt: Date.now(),
  });
};

export type LibraryData = {
  audios: AudioItem[];
  images: ImageItem[];
  texts: TextItem[];
  documents: DocumentItem[];
  funnels: Funnel[];
};
