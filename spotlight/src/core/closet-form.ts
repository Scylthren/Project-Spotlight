import { sameColors } from './color-selection';
import { attributesToFields, EMPTY_ATTRIBUTE_FIELDS, sameAttributes, type AttributeFields } from './item-attributes';
import { sameTagSet } from './tags';
import type { Category, ClothingItem, ItemColor, Season } from './types';

/** Adds `season` if absent, removes it if present. Preserves insertion order. */
export function toggleSeason(selected: readonly Season[], season: Season): Season[] {
  return selected.includes(season)
    ? selected.filter((s) => s !== season)
    : [...selected, season];
}

/** The editable fields of the item form (add and edit share these). */
export interface ItemFormValues {
  /** The name as typed (trimmed when saved; blank means no name). Missing means no name. */
  name?: string;
  category: Category | null;
  /** Chosen in the color matrix, primary first (rules in color-selection.ts). Empty until chosen. */
  colors: ItemColor[];
  seasons: Season[];
  /** Normalized tags (see tags.ts). */
  tags: string[];
  /**
   * Type, pattern, material, fit, formality with their sources
   * (item-attributes.ts). Missing means all empty and untouched.
   */
  attributes?: AttributeFields;
}

export const EMPTY_ITEM_FORM: Readonly<ItemFormValues> = Object.freeze({
  category: null,
  colors: [],
  seasons: [],
  tags: [],
  attributes: EMPTY_ATTRIBUTE_FIELDS,
});

/** Prefills the form from a stored item. Returns copies; editing them does not change `item`. */
export function itemToFormValues(item: ClothingItem): ItemFormValues {
  return {
    ...(item.name === undefined ? {} : { name: item.name }),
    category: item.category,
    colors: item.colors.map((c) => ({ ...c })),
    seasons: [...item.seasons],
    tags: [...item.tags],
    attributes: attributesToFields(item.attributes),
  };
}

/**
 * True if `draft` differs from `existing` in a field the edit form controls:
 * name (an added, changed or removed name), category, colors (order matters, since the first is the primary color; a
 * changed hex or source counts too, e.g. the user confirming a detected
 * color), seasons, or tags (both compared as sets; order carries no meaning), or
 * attributes (value and source). Photos
 * (see `hasPhotoChanges`), id, and timestamps are not compared. Pass a
 * validated (normalized) draft.
 */
export function hasDetailChanges(existing: ClothingItem, draft: ClothingItem): boolean {
  if ((existing.name ?? null) !== (draft.name ?? null)) return true;
  if (existing.category !== draft.category) return true;
  if (!sameColors(existing.colors, draft.colors)) return true;
  const before = new Set(existing.seasons);
  const after = new Set(draft.seasons);
  if (before.size !== after.size || [...after].some((s) => !before.has(s))) return true;
  if (!sameAttributes(existing.attributes, draft.attributes)) return true;
  return !sameTagSet(existing.tags, draft.tags);
}
