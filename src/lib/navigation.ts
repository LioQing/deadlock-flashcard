export type View = 'overview' | 'study' | 'history' | 'summary';

export interface AppRoute {
  view: View;
  gameId?: string;
  day?: string;
}

export function readRoute(hash: string, hasActive: boolean): AppRoute {
  const path = hash.replace(/^#\/?/, '');
  if (!path) return { view: hasActive ? 'study' : 'overview' };
  if (path === 'practice') return { view: 'study' };
  if (path === 'history') return { view: 'history' };
  const day = path.match(/^history\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (day) {
    const date = new Date(`${day[1]}T12:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day[1]) return { view: 'history', day: day[1] };
  }
  const game = path.match(/^history\/game\/([\w-]+)$/);
  if (game) return { view: 'summary', gameId: game[1] };
  return { view: 'overview' };
}

export function routeHash(route: AppRoute): string {
  if (route.view === 'summary' && route.gameId) return `#/history/game/${route.gameId}`;
  if (route.view === 'history' && route.day) return `#/history/day/${route.day}`;
  return `#/${route.view === 'study' ? 'practice' : route.view}`;
}
