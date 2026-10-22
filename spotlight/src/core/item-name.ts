/**
 * The item name (ROADMAP "Item name field", 2026-10-22): optional, trimmed,
 * at most ITEM_NAME_MAX_LENGTH characters. An item without a name shows its
 * category instead (closet tile, item screen title).
 */
import { CATEGORY_LABELS } from './labels';
import type { ClothingItem } from './types';

export const ITEM_NAME_MAX_LENGTH = 60;

/** Characters as the user sees them (code points), so an emoji counts once. */
function length(text: string): number {
  return [...text].length;
}

/** A stored name: a string, trimmed, non-empty, at most ITEM_NAME_MAX_LENGTH characters. */
export function isValidItemName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    length(value) <= ITEM_NAME_MAX_LENGTH
  );
}

/**
 * The name to store for what was typed: trimmed, or undefined when nothing
 * is left (the item has no name). Too-long names are returned as is, so
 * validation rejects them instead of cutting them silently.
 */
export function normalizeItemName(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** What the item is called on screen: its name, or its category ("Top"). */
export function itemDisplayName(item: Pick<ClothingItem, 'name' | 'category'>): string {
  return item.name ?? CATEGORY_LABELS[item.category];
}

/** How the delete confirmation names the item: `"Black band hoodie"`, or `this top`. */
export function itemDeleteSubject(item: Pick<ClothingItem, 'name' | 'category'>): string {
  return item.name === undefined ? `this ${item.category}` : `"${item.name}"`;
}
