import type { Item, ItemSlotType } from '@deadlock-api/ui-core';

export type { Item, ItemProperty, ItemSlotType } from '@deadlock-api/ui-core';

export const CATEGORIES: ItemSlotType[] = ['weapon', 'vitality', 'spirit'];
export const CATEGORY_NAMES = { weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit' };
export const GAME_LENGTH = 15;
export const STORAGE_KEY = 'deadlock-flashcard:v1';

export interface RelatedItem {
  name: string;
  image?: string;
}

export interface Question {
  item: Item;
  propertyKey: string;
  correctLabel: string;
  choices: string[];
  components: RelatedItem[];
  parents: RelatedItem[];
}

export interface Guess {
  index: number;
  itemName: string;
  category: ItemSlotType;
  propertyKey: string;
  correctLabel: string;
  selection: string | null;
  points: -1 | 0 | 1;
  answeredAt: string;
  day: string;
}

export interface GameRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed' | 'abandoned';
  guesses: Guess[];
  penalty: { points: number; at: string; day: string } | null;
}

export interface ActiveGame {
  id: string;
  index: number;
  questions: Question[];
}

export interface StudyState {
  version: 1;
  revision: string;
  games: GameRecord[];
  active: ActiveGame | null;
}

export interface DailyStats {
  day: string;
  guesses: number;
  correct: number;
  incorrect: number;
  unsure: number;
  score: number;
  completed: number;
  abandoned: number;
}
