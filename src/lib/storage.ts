import type { StudyState } from '../types';
import { STORAGE_KEY } from '../types';
import { stateSchema } from './schema';

export function emptyState(): StudyState {
  return { version: 1, revision: '', games: [], active: null };
}

export function readState(storage: Pick<Storage, 'getItem'>): StudyState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  const parsed = stateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('Saved progress is invalid or belongs to an unsupported version. Your saved data has not been overwritten.');
  return parsed.data;
}

export function saveState(storage: Pick<Storage, 'getItem' | 'setItem'>, previous: StudyState, next: StudyState): StudyState {
  // Prevent stale tabs from silently overwriting a newer answer or penalty.
  const current = readState(storage);
  if (current.revision !== previous.revision) throw new Error('Progress changed in another tab. Reload this tab to continue with the latest saved game.');
  const updated = { ...next, revision: crypto.randomUUID() };
  stateSchema.parse(updated);
  storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function storageError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'SecurityError')) {
    return 'Your browser could not save progress. Local storage may be full or disabled. No points were changed. Allow storage or export your history before freeing space.';
  }
  return error instanceof Error ? error.message : 'Unable to read or save browser storage. No points were changed.';
}
