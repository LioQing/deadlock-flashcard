import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyState } from '../types';
import { STORAGE_KEY } from '../types';
import { transition, type StudyAction } from '../lib/game';
import { emptyState, readState, saveState, storageError } from '../lib/storage';

export function useStudy() {
  const [initial] = useState(() => {
    try { return { state: readState(localStorage), error: '' }; }
    catch (error) { return { state: emptyState(), error: storageError(error) }; }
  });
  const [state, setState] = useState<StudyState>(initial.state);
  const [error, setError] = useState(initial.error);
  const stateRef = useRef(state);
  const blocked = useRef(!!initial.error);

  const reload = useCallback(() => {
    try {
      const fresh = readState(localStorage);
      stateRef.current = fresh;
      setState(fresh);
      setError('');
      blocked.current = false;
    } catch (cause) {
      setError(storageError(cause));
      blocked.current = true;
    }
  }, []);

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) reload();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [reload]);

  const dispatch = useCallback((action: StudyAction) => {
    if (blocked.current) return false;
    try {
      const previous = stateRef.current;
      const next = transition(previous, action);
      if (next === previous) return false;
      const saved = saveState(localStorage, previous, next);
      stateRef.current = saved;
      setState(saved);
      setError('');
      return true;
    } catch (cause) {
      blocked.current = true;
      setError(storageError(cause));
      return false;
    }
  }, []);

  return { state, dispatch, error, reload };
}
