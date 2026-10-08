import { describe, expect, it } from 'vitest';
import { createGame, eligibleProperties, localDay, maskItem, propertyLabel, shuffle, transition } from './game';
import { emptyState, readState, saveState } from './storage';
import { dailyStats, gameScore, studyStreak } from './stats';
import { stateSchema } from './schema';
import { fixtureItems } from '../test/fixtures';
import { CATEGORIES, STORAGE_KEY } from '../types';
import type { StudyState } from '../types';

const at = new Date(2026, 9, 7, 13, 30);
const start = () => transition(emptyState(), { type: 'start', game: createGame(fixtureItems()), at });
const answer = (state: StudyState, kind: 'correct' | 'incorrect' | 'unsure' = 'correct', date = at) => {
  const question = state.active!.questions[state.active!.index];
  return transition(state, { type: 'answer', at: date, selection: kind === 'unsure' ? null : kind === 'correct' ? question.correctLabel : question.choices.find(c => c !== question.correctLabel)! });
};

describe('question generation and masking', () => {
  it('samples 15 distinct items with five from each shop category', () => {
    for (let i = 0; i < 10; i++) {
      const game = createGame(fixtureItems());
      expect(game.questions).toHaveLength(15);
      expect(new Set(game.questions.map(q => q.item.id)).size).toBe(15);
      for (const category of CATEGORIES) expect(game.questions.filter(q => q.item.item_slot_type === category)).toHaveLength(5);
      for (const q of game.questions) {
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices.filter(c => c === q.correctLabel)).toHaveLength(1);
        expect(q.choices).not.toContain(propertyLabel(q.item.properties![q.propertyKey === 'Stat' ? 'Other' : 'Stat']));
      }
    }
  });

  it('masks only the chosen property and leaves the original and all other tooltip content intact', () => {
    const item = fixtureItems()[0];
    const before = structuredClone(item);
    const masked = maskItem(item, 'Stat');
    expect(masked.properties!.Stat.value).toBe('[?]');
    expect(masked.properties!.Stat.label).toBe('');
    expect(masked.properties!.Stat.icon).toBeNull();
    expect(masked.properties!.Stat.prefix).toBe('');
    expect(masked.properties!.Other).toEqual(item.properties!.Other);
    expect(masked.tooltip_sections).toEqual(item.tooltip_sections);
    expect(masked.name).toBe(item.name);
    expect(masked.cost).toBe(item.cost);
    expect(item).toEqual(before);
  });

  it('only quizzes visible rows and avoids timing pills and description clues', () => {
    const item = fixtureItems()[0];
    item.tooltip_sections![0].section_attributes[0].properties!.push('Hidden', 'AbilityCooldown');
    expect(eligibleProperties(item)).toEqual(['Stat', 'Other']);
    item.tooltip_sections![0].section_attributes[0].loc_string = '<span>Weapon Power</span> is increased.';
    expect(eligibleProperties(item)).toEqual(['Other']);
  });

  it('fails rather than producing an unbalanced game from insufficient data', () => {
    expect(() => createGame(fixtureItems().filter(i => i.item_slot_type !== 'spirit'))).toThrow('Not enough');
  });

  it('formats signs and units without repeating suffixes', () => {
    expect(propertyLabel({ value: '15', prefix: '{s:sign}', postfix: '%', label: 'Resist' })).toBe('+15% Resist');
    expect(propertyLabel({ value: '-15%', prefix: '{s:sign}', postfix: '%', label: 'Resist' })).toBe('-15% Resist');
  });

  it('shuffles without mutating its input', () => {
    const input = [1, 2, 3, 4];
    expect(shuffle(input, () => 0)).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
  });
});

describe('scoring and state transitions', () => {
  it('awards +1, -1, and 0 and never records the same answer twice', () => {
    let state = start();
    state = answer(state);
    expect(state.games[0].guesses[0].points).toBe(1);
    expect(answer(state, 'incorrect')).toBe(state);
    state = transition(state, { type: 'next' });
    state = answer(state, 'incorrect');
    state = transition(state, { type: 'next' });
    state = answer(state, 'unsure');
    expect(state.games[0].guesses.map(g => g.points)).toEqual([1, -1, 0]);
    expect(gameScore(state.games[0])).toBe(0);
    expect(stateSchema.safeParse(state).success).toBe(true);
  });

  it('does not advance an unanswered question or accept invalid selections', () => {
    const state = start();
    expect(transition(state, { type: 'next' })).toBe(state);
    expect(transition(state, { type: 'answer', selection: 'not an option', at })).toBe(state);
  });

  it('sets the final score to -10 exactly once and keeps answer logs', () => {
    const answered = answer(start());
    const abandoned = transition(answered, { type: 'abandon', at });
    expect(abandoned.active).toBeNull();
    expect(gameScore(abandoned.games[0])).toBe(-10);
    expect(abandoned.games[0].penalty?.points).toBe(-11);
    expect(abandoned.games[0].guesses).toEqual(answered.games[0].guesses);
    expect(transition(abandoned, { type: 'abandon', at })).toBe(abandoned);
    expect(stateSchema.safeParse(abandoned).success).toBe(true);
  });

  it.each([-14, -12, -10, -9, -1, 0, 1, 14])('abandons a game at %i with the lower of its score and -10', score => {
    let state = start();
    for (let i = 0; i < Math.abs(score); i++) {
      state = answer(state, score > 0 ? 'correct' : 'incorrect');
      state = transition(state, { type: 'next' });
    }
    const abandoned = transition(state, { type: 'abandon', at });
    expect(gameScore(abandoned.games[0])).toBe(Math.min(score, -10));
    expect(abandoned.games[0].penalty?.points).toBe(Math.min(score, -10) - score);
    expect(abandoned.games[0].guesses).toEqual(state.games[0].guesses);
    expect(dailyStats(abandoned.games)[0]).toMatchObject({ score: Math.min(score, -10), abandoned: 1 });
    expect(stateSchema.safeParse(abandoned).success).toBe(true);
    expect(transition(abandoned, { type: 'abandon', at })).toBe(abandoned);
  });

  it('replacing an unfinished game records a penalty and a new balanced game', () => {
    const current = answer(start());
    const replaced = transition(current, { type: 'start', game: createGame(fixtureItems()), at, replaceId: current.active!.id });
    expect(replaced.games).toHaveLength(2);
    expect(replaced.games[0].status).toBe('abandoned');
    expect(gameScore(replaced.games[0])).toBe(-10);
    expect(replaced.games[1].status).toBe('active');
    expect(stateSchema.safeParse(replaced).success).toBe(true);
  });

  it('replacing a game below -10 does not increase or further reduce its score', () => {
    let state = start();
    for (let i = 0; i < 12; i++) {
      state = transition(answer(state, 'incorrect'), { type: 'next' });
    }
    const replaced = transition(state, { type: 'start', game: createGame(fixtureItems()), at, replaceId: state.active!.id });
    expect(gameScore(replaced.games[0])).toBe(-12);
    expect(replaced.games[0].penalty?.points).toBe(0);
    expect(replaced.games[1].status).toBe('active');
    expect(stateSchema.safeParse(replaced).success).toBe(true);
  });

  it('rejects stale new-game clicks or confirmations for a different unfinished game', () => {
    const state = start();
    expect(transition(state, { type: 'start', game: createGame(fixtureItems()), at })).toBe(state);
    expect(transition(state, { type: 'start', game: createGame(fixtureItems()), at, replaceId: 'old-game' })).toBe(state);
    expect(transition(state, { type: 'abandon', at, gameId: 'old-game' })).toBe(state);
  });

  it('completes immediately on the last answer while preserving the last reveal', () => {
    let state = start();
    for (let i = 0; i < 15; i++) {
      state = answer(state);
      if (i < 14) state = transition(state, { type: 'next' });
      expect(stateSchema.safeParse(state).success).toBe(true);
    }
    expect(state.games[0].status).toBe('completed');
    expect(state.active!.index).toBe(14);
    expect(gameScore(state.games[0])).toBe(15);
    const restarted = transition(state, { type: 'start', game: createGame(fixtureItems()), at });
    expect(restarted.games[0].penalty).toBeNull();
    expect(transition(state, { type: 'next' }).active).toBeNull();
  });
});

describe('local dates and dashboard statistics', () => {
  it('records each answer and abandonment against its local day across midnight', () => {
    let state = answer(start(), 'correct', new Date(2026, 9, 7, 23, 59));
    state = transition(state, { type: 'next' });
    state = answer(state, 'unsure', new Date(2026, 9, 8, 0, 1));
    state = transition(state, { type: 'abandon', at: new Date(2026, 9, 8, 0, 2) });
    const days = dailyStats(state.games);
    expect(days[0]).toMatchObject({ day: '2026-10-08', guesses: 1, unsure: 1, score: -11, abandoned: 1 });
    expect(days[1]).toMatchObject({ day: '2026-10-07', guesses: 1, correct: 1, score: 1 });
    expect(localDay(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
    expect(studyStreak(days, new Date(2026, 9, 8))).toBe(2);
    expect(studyStreak(days, new Date(2026, 9, 9))).toBe(2);
    expect(studyStreak(days, new Date(2026, 9, 10))).toBe(0);
  });

  it('counts abandonment on its own day even when the score adjustment is zero', () => {
    let state = start();
    for (let i = 0; i < 12; i++) state = transition(answer(state, 'incorrect'), { type: 'next' });
    state = transition(state, { type: 'abandon', at: new Date(2026, 9, 8, 0, 2) });
    expect(dailyStats(state.games)).toMatchObject([
      { day: '2026-10-08', guesses: 0, score: 0, abandoned: 1 },
      { day: '2026-10-07', guesses: 12, score: -12, abandoned: 0 },
    ]);
  });
});

describe('storage safety', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  };

  it('round-trips complete questions and revealed answers for resuming', () => {
    const storage = memory();
    const state = answer(start(), 'incorrect');
    const saved = saveState(storage, emptyState(), state);
    expect(readState(storage)).toEqual(saved);
    expect(saved.active!.questions).toEqual(state.active!.questions);
  });

  it.each([-12, 1])('round-trips abandonment adjustments for an initial score of %i', score => {
    const storage = memory();
    let state = start();
    for (let i = 0; i < Math.abs(score); i++) {
      state = transition(answer(state, score > 0 ? 'correct' : 'incorrect'), { type: 'next' });
    }
    const saved = saveState(storage, emptyState(), transition(state, { type: 'abandon', at }));
    expect(readState(storage)).toEqual(saved);
    expect(gameScore(readState(storage).games[0])).toBe(Math.min(score, -10));
  });

  it('preserves previously stored fixed -10 penalties without rewriting history', () => {
    const storage = memory();
    const state = transition(answer(start()), { type: 'abandon', at });
    state.games[0].penalty!.points = -10;
    const saved = saveState(storage, emptyState(), state);
    expect(readState(storage)).toEqual(saved);
    expect(gameScore(readState(storage).games[0])).toBe(-9);
  });

  it('rejects malformed progress without deleting or overwriting it', () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, '{"version":99}');
    expect(() => readState(storage)).toThrow('not been overwritten');
    expect(storage.getItem(STORAGE_KEY)).toBe('{"version":99}');
  });

  it('rejects stale tabs rather than overwriting a newer score', () => {
    const storage = memory();
    const saved = saveState(storage, emptyState(), start());
    expect(() => saveState(storage, emptyState(), start())).toThrow('another tab');
    expect(readState(storage)).toEqual(saved);
  });

  it('does not mutate the original state when the browser refuses a write', () => {
    const previous = emptyState();
    const next = start();
    expect(() => saveState({ getItem: () => null, setItem: () => { throw new Error('Storage full'); } }, previous, next)).toThrow('Storage full');
    expect(previous.games).toEqual([]);
    expect(next.revision).toBe('');
  });
});
