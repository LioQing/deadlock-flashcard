import type { Item, ItemProperty, ActiveGame, Question, StudyState, Guess } from '../types';
import { CATEGORIES, GAME_LENGTH } from '../types';

// Timing pills reveal their semantic identity through their placement. Keep them
// visible, but only quiz standalone property rows whose full identity can be hidden.
const TIMINGS = new Set(['AbilityCooldown', 'ProcCooldown', 'AbilityChargeUpTime', 'AbilityCooldownBetweenCharge']);

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shuffle<T>(values: readonly T[], random = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function propertyLabel(prop: ItemProperty): string {
  const value = String(prop.value ?? '');
  const number = Number.parseFloat(value);
  const sign = Number.isFinite(number) && number >= 0 ? '+' : '';
  const prefix = (prop.prefix ?? '').replace('{s:sign}', sign);
  const postfix = prop.postfix ?? '';
  const suffix = postfix.trim() && value.endsWith(postfix.trim()) ? '' : postfix;
  return `${prefix}${value}${suffix} ${prop.label ?? ''}`.trim();
}

export function visibleProperty(prop: ItemProperty): boolean {
  return prop.value != null && String(prop.value) !== '0'
    && (prop.disable_value == null || String(prop.value) !== String(prop.disable_value));
}

export function eligibleProperties(item: Item): string[] {
  const attributes = (item.tooltip_sections ?? []).flatMap(section => section.section_attributes);
  const descriptions = attributes.map(attr => attr.loc_string ?? '').join(' ').replace(/<[^>]*>/g, ' ').toLowerCase();
  const keys = new Set(attributes.flatMap(attr => [
    ...(attr.properties ?? []), ...(attr.elevated_properties ?? []), ...(attr.important_properties ?? []),
  ]));
  return [...keys].filter(key => {
    const prop = item.properties?.[key];
    if (!prop?.label || !visibleProperty(prop) || TIMINGS.has(key)) return false;
    // Avoid hiding a row whose name/answer also appears in unchanged descriptions.
    if (descriptions.includes(prop.label.toLowerCase())) return false;
    const label = propertyLabel(prop);
    return ![...keys].some(other => other !== key && item.properties?.[other]
      && propertyLabel(item.properties[other]) === label);
  });
}

export function maskItem(item: Item, propertyKey: string): Item {
  const original = item.properties?.[propertyKey];
  if (!original) throw new Error('This question has no matching property.');
  return {
    ...item,
    properties: {
      ...item.properties,
      [propertyKey]: {
        ...original,
        value: '[?]', label: '', prefix: '', postfix: '', postvalue_label: '',
        css_class: null, icon: null, conditional: null, negative_attribute: false,
        scale_function: null, usage_flags: [],
      },
    },
  };
}

export function createGame(items: Item[], random = Math.random): ActiveGame {
  const pool = items.filter(item => item.shopable && !item.disabled && CATEGORIES.includes(item.item_slot_type));
  const allByClass = new Map(items.map(item => [item.class_name as string, item]));
  const related = (item: Item) => ({
    name: item.name,
    image: item.shop_image_webp || item.shop_image || item.image_webp || item.image || undefined,
  });
  const questions: Question[] = [];

  for (const category of CATEGORIES) {
    const categoryItems = pool.filter(item => item.item_slot_type === category);
    const candidates: Question[] = [];
    for (const item of shuffle(categoryItems, random)) {
      for (const key of shuffle(eligibleProperties(item), random)) {
        const correctLabel = propertyLabel(item.properties![key]);
        const visibleLabels = new Set((item.tooltip_sections ?? []).flatMap(s => s.section_attributes)
          .flatMap(a => [...(a.properties ?? []), ...(a.elevated_properties ?? []), ...(a.important_properties ?? [])])
          .filter(k => k !== key && item.properties?.[k] && visibleProperty(item.properties[k]))
          .map(k => propertyLabel(item.properties![k])));
        const comparable = categoryItems.filter(other => other.id !== item.id)
          .sort((a, b) => Number(b.item_tier === item.item_tier) - Number(a.item_tier === item.item_tier));
        // Prefer the same shop tier, then widen to the same category if needed.
        const labels = [...new Set(comparable.flatMap(other => eligibleProperties(other)
          .map(k => propertyLabel(other.properties![k]))))]
          .filter(label => label !== correctLabel && !visibleLabels.has(label));
        if (labels.length < 3) continue;
        const preferred = labels.slice(0, Math.max(12, Math.floor(labels.length / 2)));
        candidates.push({
          item, propertyKey: key, correctLabel,
          choices: shuffle([correctLabel, ...shuffle(preferred, random).slice(0, 3)], random),
          components: (item.component_items ?? []).map(cn => allByClass.get(cn)).filter((i): i is Item => !!i).map(related),
          parents: items.filter(other => !other.disabled && other.component_items?.includes(item.class_name)).map(related),
        });
        break;
      }
      if (candidates.length === 5) break;
    }
    if (candidates.length < 5) throw new Error(`Not enough quiz-ready ${category} items. Please refresh the item data.`);
    questions.push(...candidates);
  }
  return { id: crypto.randomUUID(), index: 0, questions: shuffle(questions, random) };
}

export type StudyAction =
  | { type: 'start'; game: ActiveGame; at: Date; replaceId?: string }
  | { type: 'answer'; selection: string | null; at: Date }
  | { type: 'next' }
  | { type: 'abandon'; at: Date; gameId?: string };

export function transition(state: StudyState, action: StudyAction): StudyState {
  if (action.type === 'start') {
    const current = state.games.find(game => game.id === state.active?.id);
    if (current?.status === 'active' && action.replaceId !== current.id) return state;
    const clean = state.active ? transition(state, { type: 'abandon', at: action.at }) : state;
    return { ...clean, active: action.game, games: [...clean.games, {
      id: action.game.id, startedAt: action.at.toISOString(), endedAt: null,
      status: 'active', guesses: [], penalty: null,
    }] };
  }
  if (!state.active) return state;
  const active = state.active;
  const record = state.games.find(game => game.id === active.id);
  if (!record) return state;

  if (action.type === 'abandon') {
    if (action.gameId !== undefined && action.gameId !== active.id) return state;
    const score = record.guesses.reduce((sum, guess) => sum + guess.points, 0);
    const points = Math.min(score, -10) - score;
    return { ...state, active: null, games: state.games.map(game => game.id !== active.id || game.status !== 'active' ? game : {
      ...game, status: 'abandoned', endedAt: action.at.toISOString(),
      penalty: { points, at: action.at.toISOString(), day: localDay(action.at) },
    }) };
  }
  if (action.type === 'next') {
    if (!record.guesses[active.index]) return state;
    return { ...state, active: active.index === GAME_LENGTH - 1 ? null : { ...active, index: active.index + 1 } };
  }
  if (record.status !== 'active' || record.guesses[active.index]) return state;
  const question = active.questions[active.index];
  if (action.selection !== null && !question.choices.includes(action.selection)) return state;
  const points = action.selection === null ? 0 : action.selection === question.correctLabel ? 1 : -1;
  const guess: Guess = {
    index: active.index, itemName: question.item.name, category: question.item.item_slot_type,
    propertyKey: question.propertyKey, correctLabel: question.correctLabel,
    selection: action.selection, points, answeredAt: action.at.toISOString(), day: localDay(action.at),
  };
  const finished = active.index === GAME_LENGTH - 1;
  return { ...state, games: state.games.map(game => game.id !== active.id ? game : {
    ...game, guesses: [...game.guesses, guess],
    status: finished ? 'completed' : 'active', endedAt: finished ? action.at.toISOString() : null,
  }) };
}
