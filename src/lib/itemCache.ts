import { z } from 'zod';
import { ITEMS_URL, parseItems } from './api';
import { itemSchema } from './schema';
import type { Item } from '../types';

export const ITEM_CACHE_DB = 'deadlock-flashcard-items';
export const ITEM_CACHE_STORE = 'items';
export const ITEM_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;

const cacheSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.number().int().nonnegative(),
  items: z.array(itemSchema).min(1),
});

export interface ItemCache {
  version: 1;
  fetchedAt: number;
  items: Item[];
}

// Item caching is best-effort. Blocked, unavailable, or full storage must not
// prevent network loading or affect the separate saved-progress store.
function accessCache<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise(resolve => {
    let database: IDBDatabase | undefined;
    let settled = false;
    const finish = (result: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      database?.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 1500);
    try {
      const request = indexedDB.open(ITEM_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ITEM_CACHE_STORE)) request.result.createObjectStore(ITEM_CACHE_STORE);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => {
        database = request.result;
        if (settled) { database.close(); return; }
        database.onversionchange = () => database?.close();
        try {
          const transaction = database.transaction(ITEM_CACHE_STORE, mode);
          const operation = action(transaction.objectStore(ITEM_CACHE_STORE));
          transaction.oncomplete = () => finish(operation.result ?? null);
          transaction.onerror = () => finish(null);
          transaction.onabort = () => finish(null);
        } catch { finish(null); }
      };
    } catch { finish(null); }
  });
}

export async function readItemCache(): Promise<ItemCache | null> {
  const raw = await accessCache<unknown>('readonly', store => store.get(ITEMS_URL));
  const parsed = cacheSchema.safeParse(raw);
  if (!parsed.success || parsed.data.fetchedAt > Date.now()) return null;
  // Revalidate and sanitize persisted descriptions, not just API responses.
  return { ...parsed.data, items: parseItems(parsed.data.items) };
}

export async function writeItemCache(items: Item[], fetchedAt: number): Promise<void> {
  await accessCache('readwrite', store => store.put({ version: 1, fetchedAt, items } satisfies ItemCache, ITEMS_URL));
}
