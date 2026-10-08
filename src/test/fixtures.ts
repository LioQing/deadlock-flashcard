import { CATEGORIES, type Item } from '../types';

export function fixtureItems(): Item[] {
  return CATEGORIES.flatMap((category, ci) => Array.from({ length: 8 }, (_, index) => ({
    id: ci * 100 + index,
    class_name: `upgrade_${category}_${index}` as Item['class_name'],
    name: `${category} item ${index}`,
    type: 'upgrade' as const, item_slot_type: category, item_tier: 1 as const,
    activation: 'passive' as const, shopable: true, disabled: false, cost: 800,
    properties: {
      Stat: { value: String(10 + index), label: `${category} Power`, prefix: '{s:sign}', postfix: '%', icon: 'https://example.com/icon.svg', css_class: 'damage' },
      Other: { value: String(100 + index), label: 'Bonus Health', prefix: '{s:sign}' },
      Hidden: { value: '0', label: 'Unused Stat' },
      AbilityCooldown: { value: '10', label: 'Cooldown', postfix: 's' },
    },
    tooltip_sections: [{ section_type: 'innate' as const, section_attributes: [{ properties: ['Stat', 'Other'], loc_string: 'An unchanged description.' }] }],
  })));
}
