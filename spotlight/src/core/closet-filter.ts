/**
 * Closet search and category filter (Closet.dc.html). Pure functions: the
 * screen keeps the query and the selected category, and shows what
 * `filterCloset` returns.
 *
 * Search is case-insensitive and matches an item's category (its id and its
 * singular and plural labels), its color names ("Light grey") and its style
 * tags. Each word of the query must match one of those, so "navy top" finds
 * navy tops. A word matches when it is part of a field ("blue" finds "Sky
 * blue"). Search and the category filter combine.
 */
import { CATEGORY_LABELS, CATEGORY_PLURAL_LABELS } from './labels';
import { paletteName } from './palette';
import { CATEGORIES, type Category, type ClothingItem } from './types';

export type CategoryFilter = 'all' | Category;

/** The filter chips, in order: All, then each category. */
export const CATEGORY_FILTERS: readonly CategoryFilter[] = Object.freeze(['all', ...CATEGORIES]);

export interface ClosetFilter {
  query: string;
  category: CategoryFilter;
}

export const NO_CLOSET_FILTER: ClosetFilter = Object.freeze({ query: '', category: 'all' });

/** Chip text: "All", "Tops", "Accessories". */
export function categoryFilterLabel(filter: CategoryFilter): string {
  return filter === 'all' ? 'All' : CATEGORY_PLURAL_LABELS[filter];
}

/** The query's words, lowercased, without empty ones. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
}

/** Everything an item can be found by, lowercased. */
export function searchableText(item: ClothingItem): string[] {
  return [
    item.category,
    CATEGORY_LABELS[item.category],
    CATEGORY_PLURAL_LABELS[item.category],
    ...item.colors.map((c) => paletteName(c.paletteId)),
    ...item.tags,
  ].map((text) => text.toLowerCase());
}

/** True when every word of `query` is part of one of the item's fields. An empty query matches. */
export function matchesSearch(item: ClothingItem, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const fields = searchableText(item);
  return terms.every((term) => fields.some((field) => field.includes(term)));
}

export function matchesCategory(item: ClothingItem, category: CategoryFilter): boolean {
  return category === 'all' || item.category === category;
}

/** The items matching both the search and the category, in their original order. */
export function filterCloset<T extends ClothingItem>(items: readonly T[], filter: ClosetFilter): T[] {
  return items.filter((item) => matchesCategory(item, filter.category) && matchesSearch(item, filter.query));
}

/** True when the filter hides nothing (no search words, All selected). */
export function isUnfiltered(filter: ClosetFilter): boolean {
  return filter.category === 'all' && searchTerms(filter.query).length === 0;
}

/**
 * What to say when the filter leaves nothing to show (the closet itself is
 * not empty; that case has its own message).
 */
export function noMatchesMessage(filter: ClosetFilter): string {
  const query = filter.query.trim();
  const terms = searchTerms(query);
  if (filter.category === 'all') return `Nothing in your closet matches "${query}".`;
  const group = CATEGORY_PLURAL_LABELS[filter.category];
  if (terms.length === 0) return `No ${group.toLowerCase()} in your closet yet.`;
  return `No ${group.toLowerCase()} match "${query}".`;
}

/** The masthead count: "1 piece", "24 pieces". */
export function pieceCount(count: number): string {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
}
