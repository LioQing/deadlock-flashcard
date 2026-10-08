import type { DailyStats, GameRecord } from '../types';
import { localDay } from './game';

export function gameScore(game: GameRecord): number {
  return game.guesses.reduce((sum, guess) => sum + guess.points, 0) + (game.penalty?.points ?? 0);
}

export function dailyStats(games: GameRecord[]): DailyStats[] {
  const days = new Map<string, DailyStats>();
  const get = (day: string) => {
    let stats = days.get(day);
    if (!stats) {
      stats = { day, guesses: 0, correct: 0, incorrect: 0, unsure: 0, score: 0, completed: 0, abandoned: 0 };
      days.set(day, stats);
    }
    return stats;
  };
  for (const game of games) {
    for (const guess of game.guesses) {
      const stats = get(guess.day);
      stats.guesses++;
      stats.score += guess.points;
      if (guess.points === 1) stats.correct++;
      else if (guess.points === -1) stats.incorrect++;
      else stats.unsure++;
    }
    if (game.penalty) {
      const stats = get(game.penalty.day);
      stats.score += game.penalty.points;
      stats.abandoned++;
    }
    if (game.status === 'completed' && game.endedAt) get(localDay(new Date(game.endedAt))).completed++;
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function accuracy(correct: number, total: number): string {
  return total ? `${Math.round(correct / total * 100)}%` : '0%';
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function studyStreak(days: DailyStats[], now = new Date()): number {
  const active = new Set(days.filter(day => day.guesses > 0).map(day => day.day));
  const cursor = new Date(now);
  if (!active.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(localDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
