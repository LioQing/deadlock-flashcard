import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadItems } from './api';
import { ITEM_CACHE_MAX_AGE, readItemCache, writeItemCache, type ItemCache } from './itemCache';
import { loadCachedItems } from './itemLoader';
import { fixtureItems } from '../test/fixtures';
import { createGame } from './game';

vi.mock('./api', () => ({ loadItems: vi.fn() }));
vi.mock('./itemCache', () => ({
  ITEM_CACHE_MAX_AGE: 6 * 60 * 60 * 1000,
  readItemCache: vi.fn(),
  writeItemCache: vi.fn(),
}));

const now = new Date('2026-10-08T12:00:00Z');
const cached = (age = 0): ItemCache => ({ version: 1, fetchedAt: now.getTime() - age, items: fixtureItems() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(readItemCache).mockResolvedValue(null);
  vi.mocked(loadItems).mockResolvedValue(fixtureItems());
  vi.mocked(writeItemCache).mockResolvedValue();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe('persistent item loading', () => {
  it('fetches and persists items on the first visit', async () => {
    const onItems = vi.fn();
    const signal = new AbortController().signal;
    await loadCachedItems(signal, onItems);
    expect(loadItems).toHaveBeenCalledWith(signal);
    expect(onItems).toHaveBeenCalledWith(fixtureItems());
    expect(writeItemCache).toHaveBeenCalledWith(fixtureItems(), now.getTime());
  });

  it('reuses a fresh cache without any API request', async () => {
    const entry = cached(ITEM_CACHE_MAX_AGE - 1);
    vi.mocked(readItemCache).mockResolvedValue(entry);
    const onItems = vi.fn();
    await loadCachedItems(new AbortController().signal, onItems);
    expect(onItems).toHaveBeenCalledExactlyOnceWith(entry.items);
    expect(loadItems).not.toHaveBeenCalled();
    expect(writeItemCache).not.toHaveBeenCalled();
  });

  it('publishes expired items before the background request finishes and leaves active snapshots unchanged', async () => {
    const entry = cached(ITEM_CACHE_MAX_AGE);
    vi.mocked(readItemCache).mockResolvedValue(entry);
    const updated = fixtureItems().map(item => ({ ...item, name: `${item.name} updated` }));
    let finish!: (items: typeof updated) => void;
    vi.mocked(loadItems).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onItems = vi.fn();
    const loading = loadCachedItems(new AbortController().signal, onItems);
    await vi.waitFor(() => expect(loadItems).toHaveBeenCalled());
    expect(onItems).toHaveBeenCalledExactlyOnceWith(entry.items);
    const active = createGame(onItems.mock.calls[0][0]);
    const snapshot = structuredClone(active);
    finish(updated);
    await loading;
    expect(onItems.mock.calls.map(call => call[0])).toEqual([entry.items, updated]);
    expect(active).toEqual(snapshot);
    expect(writeItemCache).toHaveBeenCalledWith(updated, Date.now());
  });

  it('allows retry to bypass the freshness window', async () => {
    vi.mocked(readItemCache).mockResolvedValue(cached());
    await loadCachedItems(new AbortController().signal, vi.fn(), { forceRefresh: true });
    expect(loadItems).toHaveBeenCalledOnce();
  });

  it('keeps expired items and their timestamp when the API is unavailable', async () => {
    const entry = cached(ITEM_CACHE_MAX_AGE + 1);
    vi.mocked(readItemCache).mockResolvedValue(entry);
    const error = new Error('Unavailable');
    vi.mocked(loadItems).mockRejectedValue(error);
    const onItems = vi.fn();
    const onRefreshError = vi.fn();
    await loadCachedItems(new AbortController().signal, onItems, { onRefreshError });
    expect(onItems).toHaveBeenCalledExactlyOnceWith(entry.items);
    expect(onRefreshError).toHaveBeenCalledExactlyOnceWith(error);
    expect(writeItemCache).not.toHaveBeenCalled();
  });

  it('uses expired items when a background request times out', async () => {
    vi.mocked(readItemCache).mockResolvedValue(cached(ITEM_CACHE_MAX_AGE));
    const controller = new AbortController();
    const error = new DOMException('Timed out', 'TimeoutError');
    vi.mocked(loadItems).mockImplementation(async () => {
      controller.abort(error);
      throw error;
    });
    const onRefreshError = vi.fn();
    await loadCachedItems(controller.signal, vi.fn(), { onRefreshError });
    expect(onRefreshError).toHaveBeenCalledWith(error);
    expect(writeItemCache).not.toHaveBeenCalled();
  });

  it('reports network failures when no valid cache exists', async () => {
    vi.mocked(loadItems).mockRejectedValue(new Error('Unavailable'));
    const onItems = vi.fn();
    await expect(loadCachedItems(new AbortController().signal, onItems)).rejects.toThrow('Unavailable');
    expect(onItems).not.toHaveBeenCalled();
  });

  it('does not publish items from an aborted load', async () => {
    vi.mocked(readItemCache).mockResolvedValue(cached());
    const controller = new AbortController();
    controller.abort();
    const onItems = vi.fn();
    await expect(loadCachedItems(controller.signal, onItems)).rejects.toMatchObject({ name: 'AbortError' });
    expect(onItems).not.toHaveBeenCalled();
    expect(loadItems).not.toHaveBeenCalled();
  });
});
