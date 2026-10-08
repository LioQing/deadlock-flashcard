import { z } from 'zod';
import type { Item, StudyState } from '../types';
import { CATEGORIES, GAME_LENGTH } from '../types';

const category = z.enum(['weapon', 'vitality', 'spirit']);
const text = z.string().nullable().optional();
const propertySchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  label: text, prefix: text, postfix: text, postvalue_label: text,
  css_class: text, icon: text, conditional: text, disable_value: text,
  negative_attribute: z.boolean().nullable().optional(),
  usage_flags: z.array(z.string()).nullable().optional(),
}).passthrough();

export const itemSchema = z.object({
  id: z.number().int(), class_name: z.string(), name: z.string(),
  type: z.enum(['weapon', 'ability', 'upgrade', 'tech', 'armor']),
  item_slot_type: category, item_tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  activation: z.enum(['hold_toggle', 'instant_cast', 'on_button_is_down', 'passive', 'press', 'press_toggle', 'instant_cast_toggle']),
  cost: z.number().optional(), shopable: z.boolean().nullable().optional(), disabled: z.boolean().nullable().optional(),
  image: text, image_webp: text, shop_image: text, shop_image_webp: text,
  properties: z.record(z.string(), propertySchema).nullable().optional(),
  component_items: z.array(z.string()).nullable().optional(),
  tooltip_sections: z.array(z.object({
    section_type: z.enum(['innate', 'passive', 'active']).nullable().optional(),
    section_attributes: z.array(z.object({
      loc_string: text,
      properties: z.array(z.string()).nullable().optional(),
      elevated_properties: z.array(z.string()).nullable().optional(),
      important_properties: z.array(z.string()).nullable().optional(),
    }).passthrough()),
  }).passthrough()).nullable().optional(),
}).passthrough() as unknown as z.ZodType<Item>;

const date = z.iso.datetime();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const guessSchema = z.object({
  index: z.number().int().min(0).max(14), itemName: z.string(), category,
  propertyKey: z.string(), correctLabel: z.string(), selection: z.string().nullable(),
  points: z.union([z.literal(-1), z.literal(0), z.literal(1)]), answeredAt: date, day,
}).refine(guess => guess.points === (guess.selection === null ? 0 : guess.selection === guess.correctLabel ? 1 : -1));

export const stateSchema = z.object({
  version: z.literal(1), revision: z.string(),
  games: z.array(z.object({
    id: z.string(), startedAt: date, endedAt: date.nullable(),
    status: z.enum(['active', 'completed', 'abandoned']),
    guesses: z.array(guessSchema).max(GAME_LENGTH),
    penalty: z.object({ points: z.number().int().min(-10 - (GAME_LENGTH - 1)).max(0), at: date, day }).nullable(),
  }).refine(game => game.guesses.every((guess, index) => guess.index === index)
    && (game.status === 'completed' ? game.guesses.length === GAME_LENGTH : game.guesses.length < GAME_LENGTH)
    && (game.status === 'abandoned' ? game.penalty !== null : game.penalty === null)
    && (game.status === 'active' ? game.endedAt === null : game.endedAt !== null))),
  active: z.object({
    id: z.string(), index: z.number().int().min(0).max(14),
    questions: z.array(z.object({
      item: itemSchema, propertyKey: z.string(), correctLabel: z.string(),
      choices: z.array(z.string()).length(4),
      components: z.array(z.object({ name: z.string(), image: z.string().optional() })),
      parents: z.array(z.object({ name: z.string(), image: z.string().optional() })),
    }).refine(q => !!q.item.properties?.[q.propertyKey]
      && new Set(q.choices).size === 4 && q.choices.includes(q.correctLabel))).length(GAME_LENGTH),
  }).nullable(),
}).refine(state => {
  if (new Set(state.games.map(g => g.id)).size !== state.games.length) return false;
  if (!state.active) return !state.games.some(g => g.status === 'active');
  const active = state.active;
  const record = state.games.find(g => g.id === active.id);
  if (!record || record.status === 'abandoned') return false;
  if (state.games.some(g => g.status === 'active' && g.id !== active.id)) return false;
  if (![active.index, active.index + 1].includes(record.guesses.length)) return false;
  if (record.status === 'completed' && active.index !== 14) return false;
  return new Set(active.questions.map(q => q.item.id)).size === GAME_LENGTH
    && CATEGORIES.every(c => active.questions.filter(q => q.item.item_slot_type === c).length === 5)
    && record.guesses.every((guess, index) => {
      const q = active.questions[index];
      return guess.correctLabel === q.correctLabel && guess.propertyKey === q.propertyKey
        && (guess.selection === null || q.choices.includes(guess.selection));
    });
}) as z.ZodType<StudyState>;
