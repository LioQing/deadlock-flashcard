import { loadItems } from './api';
import { ITEM_CACHE_MAX_AGE, readItemCache, writeItemCache } from './itemCache';
import type { Item } from '../types';

interface LoadOptions {
  forceRefresh?: boolean;
  onRefreshError?: (error: unknown) => void;
}

export async function loadCachedItems(signal: AbortSignal, onItems: (items: Item[]) => void, options: LoadOptions = {}): Promise<void> {
  const cached = await readItemCache();
  signal.throwIfAborted();
  if (cached) {
    onItems(cached.items);
    if (!options.forceRefresh && Date.now() - cached.fetchedAt < ITEM_CACHE_MAX_AGE) return;
  }

  let items: Item[];
  try {
    items = await loadItems(signal);
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted && signal.reason?.name !== 'TimeoutError') throw signal.reason;
    if (!cached) throw error;
    options.onRefreshError?.(error);
    return;
  }
  onItems(items);
  await writeItemCache(items, Date.now());
}
