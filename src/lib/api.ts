import DOMPurify from 'dompurify';
import { itemSchema } from './schema';
import type { Item } from '../types';

export const ITEMS_URL = 'https://api.deadlock-api.com/v1/assets/items?language=english';

export async function loadItems(signal: AbortSignal): Promise<Item[]> {
  const response = await fetch(ITEMS_URL, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`The Deadlock API returned ${response.status}. Please try again.`);
  const data: unknown = await response.json();
  return parseItems(data);
}

export function parseItems(data: unknown): Item[] {
  if (!Array.isArray(data)) throw new Error('The item API returned an unexpected response.');
  const items = data.flatMap(raw => {
    const parsed = itemSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  if (!items.length) throw new Error('No usable items were returned by the Deadlock API.');
  // The tooltip library renders API descriptions as HTML. Keep its formatting,
  // but do not allow active content from a remote response.
  return items.map(item => ({
    ...item,
    tooltip_sections: item.tooltip_sections?.map(section => ({
      ...section,
      section_attributes: section.section_attributes.map(attr => ({
        ...attr,
        loc_string: attr.loc_string ? DOMPurify.sanitize(attr.loc_string, {
          ALLOWED_TAGS: ['span', 'b', 'strong', 'i', 'em', 'br', 'p', 'div', 'u'],
          ALLOWED_ATTR: ['class'],
        }) : attr.loc_string,
      })),
    })),
  }));
}
