import { describe, expect, it } from 'vitest';
import { readRoute, routeHash } from '../lib/navigation';

describe('app navigation', () => {
  it('resumes an active game only when no explicit route was requested', () => {
    expect(readRoute('', true)).toEqual({ view: 'study' });
    expect(readRoute('', false)).toEqual({ view: 'overview' });
    expect(readRoute('#/overview', true)).toEqual({ view: 'overview' });
  });

  it('round trips the practice and history routes', () => {
    for (const route of [{ view: 'study' }, { view: 'history' }, { view: 'overview' }] as const) {
      expect(readRoute(routeHash(route), false)).toEqual(route);
    }
  });

  it('retains the selected date and review id in the URL', () => {
    const day = { view: 'history', day: '2026-10-07' } as const;
    const summary = { view: 'summary', gameId: 'game-123' } as const;
    expect(readRoute(routeHash(day), false)).toEqual(day);
    expect(readRoute(routeHash(summary), false)).toEqual(summary);
  });

  it('falls back safely for unknown or malformed routes', () => {
    for (const hash of ['#/missing', '#/history/day/invalid', '#/history/day/2026-99-99', '#/history/day/2026-02-30', '#/history/game/', '#/history/game/%3Cscript%3E']) {
      expect(readRoute(hash, false)).toEqual({ view: 'overview' });
    }
  });
});
