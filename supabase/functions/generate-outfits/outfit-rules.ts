/**
 * The composition rules (Gate 3 decision D3), checked by the function on
 * every outfit before it is answered. Plain TypeScript, tested with Jest.
 *
 * An outfit is valid when:
 * - every item id is in the closet sent with the request, and none repeats;
 * - it has one top and one bottom, or one dress, never both;
 * - it has exactly one pair of shoes when that closet has any shoes, none otherwise;
 * - it has at most one outerwear and at most 5 accessories;
 * - its rationale is 1 to OUTFIT_RATIONALE_MAX_LENGTH characters after trimming.
 *
 * `validateOutfits` keeps the valid outfits (item ids sorted into category
 * order, rationale normalized), drops repeats of the same id set, and stops
 * at MAX_OUTFITS. Problems are names only, safe to log (never ids or text).
 */
import {
  MAX_OUTFITS,
  normalizeOutfitText,
  OUTFIT_MAX_ACCESSORIES,
  OUTFIT_RATIONALE_MAX_LENGTH,
  type ClosetItemSummary,
  type GeneratedOutfit,
} from '../_shared/generate-outfits-contract.ts';
import { TAG_CATEGORIES, type TagCategory } from '../_shared/tag-item-contract.ts';

export const OUTFIT_PROBLEMS = [
  'not_an_object',
  'item_ids_not_a_list',
  'unknown_id',
  'duplicate_id',
  'no_top_bottom_or_dress',
  'top_without_bottom',
  'bottom_without_top',
  'dress_with_top_or_bottom',
  'too_many_tops',
  'too_many_bottoms',
  'too_many_dresses',
  'missing_shoes',
  'too_many_shoes',
  'too_many_outerwear',
  'too_many_accessories',
  'missing_rationale',
  'rationale_too_long',
] as const;
export type OutfitProblem = (typeof OUTFIT_PROBLEMS)[number];

/** The closet sent with a request, indexed for checking outfits. */
export interface ClosetIndex {
  byId: ReadonlyMap<string, ClosetItemSummary>;
  hasShoes: boolean;
}

export function indexCloset(items: readonly ClosetItemSummary[]): ClosetIndex {
  return {
    byId: new Map(items.map((item) => [item.id, item])),
    hasShoes: items.some((item) => item.category === 'shoes'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every rule the candidate breaks (empty when it is valid). */
export function outfitProblems(candidate: unknown, closet: ClosetIndex): OutfitProblem[] {
  if (!isRecord(candidate)) return ['not_an_object'];
  const problems: OutfitProblem[] = [];
  const { itemIds, rationale } = candidate;

  if (!Array.isArray(itemIds)) {
    problems.push('item_ids_not_a_list');
  } else {
    const counts = Object.fromEntries(TAG_CATEGORIES.map((c) => [c, 0])) as Record<TagCategory, number>;
    const seen = new Set<string>();
    for (const id of itemIds) {
      const item = typeof id === 'string' ? closet.byId.get(id) : undefined;
      if (!item) {
        if (!problems.includes('unknown_id')) problems.push('unknown_id');
        continue;
      }
      if (seen.has(item.id)) {
        if (!problems.includes('duplicate_id')) problems.push('duplicate_id');
        continue;
      }
      seen.add(item.id);
      counts[item.category]++;
    }
    problems.push(...compositionProblems(counts, closet.hasShoes));
  }

  if (typeof rationale !== 'string' || normalizeOutfitText(rationale).length === 0) {
    problems.push('missing_rationale');
  } else if ([...normalizeOutfitText(rationale)].length > OUTFIT_RATIONALE_MAX_LENGTH) {
    problems.push('rationale_too_long');
  }
  return problems;
}

function compositionProblems(counts: Record<TagCategory, number>, closetHasShoes: boolean): OutfitProblem[] {
  const problems: OutfitProblem[] = [];
  const { top, bottom, dress, shoes, outerwear, accessory } = counts;
  if (top > 1) problems.push('too_many_tops');
  if (bottom > 1) problems.push('too_many_bottoms');
  if (dress > 1) problems.push('too_many_dresses');
  if (dress > 0) {
    if (top > 0 || bottom > 0) problems.push('dress_with_top_or_bottom');
  } else if (top === 0 && bottom === 0) {
    problems.push('no_top_bottom_or_dress');
  } else if (bottom === 0) {
    problems.push('top_without_bottom');
  } else if (top === 0) {
    problems.push('bottom_without_top');
  }
  // An outfit can only hold shoes from the closet, so "shoes when the closet has none" cannot happen.
  if (closetHasShoes && shoes === 0) problems.push('missing_shoes');
  if (shoes > 1) problems.push('too_many_shoes');
  if (outerwear > 1) problems.push('too_many_outerwear');
  if (accessory > OUTFIT_MAX_ACCESSORIES) problems.push('too_many_accessories');
  return problems;
}

const CATEGORY_ORDER = new Map<TagCategory, number>(TAG_CATEGORIES.map((category, index) => [category, index]));

/** A valid outfit's ids in category order (stable within a category) and its normalized rationale. */
function normalizeOutfit(candidate: { itemIds: string[]; rationale: string }, closet: ClosetIndex): GeneratedOutfit {
  const rank = (id: string) => CATEGORY_ORDER.get(closet.byId.get(id)!.category) ?? 0;
  const itemIds = candidate.itemIds.map((id, index) => ({ id, index })).sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index);
  return { itemIds: itemIds.map((entry) => entry.id), rationale: normalizeOutfitText(candidate.rationale) };
}

/** The same outfit whatever the order of its ids. */
function outfitKey(itemIds: readonly string[]): string {
  return JSON.stringify([...itemIds].sort());
}

export interface OutfitValidation {
  /** At most MAX_OUTFITS valid, distinct outfits, in the order given. */
  outfits: GeneratedOutfit[];
  /** Invalid candidates, by position, with every rule they break. */
  rejected: { index: number; problems: OutfitProblem[] }[];
  /** Valid candidates dropped as repeats of an earlier one. */
  duplicates: number;
  /** Valid, distinct candidates dropped past MAX_OUTFITS. */
  surplus: number;
}

/** Checks a list of candidate outfits against the closet sent with the request. */
export function validateOutfits(candidates: readonly unknown[], closet: ClosetIndex): OutfitValidation {
  const result: OutfitValidation = { outfits: [], rejected: [], duplicates: 0, surplus: 0 };
  const seen = new Set<string>();
  candidates.forEach((candidate, index) => {
    const problems = outfitProblems(candidate, closet);
    if (problems.length > 0) {
      result.rejected.push({ index, problems });
      return;
    }
    const outfit = normalizeOutfit(candidate as { itemIds: string[]; rationale: string }, closet);
    const key = outfitKey(outfit.itemIds);
    if (seen.has(key)) {
      result.duplicates++;
      return;
    }
    seen.add(key);
    if (result.outfits.length >= MAX_OUTFITS) {
      result.surplus++;
      return;
    }
    result.outfits.push(outfit);
  });
  return result;
}
