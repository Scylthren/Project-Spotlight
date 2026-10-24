import type { ClothingItem } from '@/core/types';

import {
  isSummaryId,
  normalizeOutfitText,
  OUTFIT_MAX_ITEMS,
  SUMMARY_MAX_COLORS,
  SUMMARY_MAX_TAGS,
  SUMMARY_NAME_MAX_LENGTH,
  SUMMARY_TAG_MAX_LENGTH,
  SUMMARY_TYPE_MAX_LENGTH,
  validateClosetItemSummary,
  type ClosetItemSummary,
} from './generate-outfits-contract';
import { TAG_COLORS, TAG_FITS, TAG_FORMALITIES, TAG_MATERIALS, TAG_PATTERNS, type TagColor } from './tag-item-contract';

/**
 * Text as it may be sent: control characters become spaces, whitespace runs
 * collapse, then it is cut to `max` characters (code points) and trimmed
 * again. Undefined when nothing is left.
 */
export function clipSummaryText(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  let cleaned = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
  }
  const clipped = [...normalizeOutfitText(cleaned)].slice(0, max).join('').trim();
  return clipped.length > 0 ? clipped : undefined;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * One closet item as the text summary sent to generate-outfits: id,
 * category, colors, seasons, and whichever of name, type, pattern,
 * material, fit, formality and tags it has (absent ones are left out, never
 * sent empty). Text is cut to the contract's caps. Null when the id cannot
 * be sent (outside the contract's id rule).
 */
export function toClosetItemSummary(item: ClothingItem): ClosetItemSummary | null {
  if (!isSummaryId(item.id)) return null;
  const colors: TagColor[] = [];
  for (const color of item.colors) {
    if (isOneOf(TAG_COLORS, color.paletteId) && !colors.includes(color.paletteId)) colors.push(color.paletteId);
  }
  const summary: ClosetItemSummary = {
    id: item.id,
    category: item.category,
    colors: colors.slice(0, SUMMARY_MAX_COLORS),
    seasons: [...new Set(item.seasons)],
  };
  const name = clipSummaryText(item.name, SUMMARY_NAME_MAX_LENGTH);
  if (name) summary.name = name;
  const attributes = item.attributes ?? {};
  const type = clipSummaryText(attributes.type?.value, SUMMARY_TYPE_MAX_LENGTH);
  if (type) summary.type = type;
  if (isOneOf(TAG_PATTERNS, attributes.pattern?.value)) summary.pattern = attributes.pattern.value;
  if (isOneOf(TAG_MATERIALS, attributes.material?.value)) summary.material = attributes.material.value;
  if (isOneOf(TAG_FITS, attributes.fit?.value)) summary.fit = attributes.fit.value;
  if (isOneOf(TAG_FORMALITIES, attributes.formality?.value)) summary.formality = attributes.formality.value;
  const tags: string[] = [];
  for (const raw of item.tags) {
    const tag = clipSummaryText(raw, SUMMARY_TAG_MAX_LENGTH)?.toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < SUMMARY_MAX_TAGS) tags.push(tag);
  }
  if (tags.length > 0) summary.tags = tags;
  return summary;
}

export interface ClosetSummaries {
  /** At most OUTFIT_MAX_ITEMS summaries, each valid under the contract, in closet order. */
  items: ClosetItemSummary[];
  /** Items left out, in total (`omittedInvalid + omittedOverCap`). */
  omitted: number;
  /** Items whose summary the contract would reject (an id outside the id rule, a bad category or season). */
  omittedInvalid: number;
  /** Valid items left out because the closet is over the request cap (the oldest-updated ones). */
  omittedOverCap: number;
}

/**
 * The closet as sent with an outfit request. Each mapped summary is checked
 * with the contract's `validateClosetItemSummary`; an item that fails is
 * left out (one bad item never blocks the request). A closet still over the
 * request cap (300) keeps its most recently updated items (ties: closet
 * order); the function's own prefilter (slice 3) chooses among what is sent.
 */
export function toClosetSummaries(items: readonly ClothingItem[]): ClosetSummaries {
  const sendable: { summary: ClosetItemSummary; updatedAt: string; index: number }[] = [];
  items.forEach((item, index) => {
    const mapped = toClosetItemSummary(item);
    const valid = mapped ? validateClosetItemSummary(mapped) : null;
    if (valid?.ok) sendable.push({ summary: valid.value, updatedAt: item.updatedAt, index });
  });
  let kept = sendable;
  if (sendable.length > OUTFIT_MAX_ITEMS) {
    const newest = [...sendable].sort((a, b) => compareDesc(a.updatedAt, b.updatedAt) || a.index - b.index).slice(0, OUTFIT_MAX_ITEMS);
    kept = newest.sort((a, b) => a.index - b.index);
  }
  const omittedInvalid = items.length - sendable.length;
  const omittedOverCap = sendable.length - kept.length;
  return { items: kept.map((entry) => entry.summary), omitted: omittedInvalid + omittedOverCap, omittedInvalid, omittedOverCap };
}

function compareDesc(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
}
