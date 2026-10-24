/**
 * The deterministic prefilter (Gate 3 slice 3): trims the closet sent with a
 * request (up to 300 items) to what reaches the prompt (at most
 * PREFILTER_MAX_ITEMS), so input tokens and latency stay bounded.
 *
 * - A closet of PREFILTER_MAX_ITEMS or fewer goes through whole.
 * - Otherwise each item is scored against the request: words of the request
 *   found in its name, type or tags; color, pattern, material and formality
 *   words; and the seasons the request (or the weather) points to.
 * - Each category first gets up to its quota (CATEGORY_QUOTAS, which add up
 *   to PREFILTER_MAX_ITEMS) of its best-scored items; slots a category cannot
 *   use go to the best-scored remaining items of any category.
 * - Every category the closet has keeps at least one item, so shoes stay
 *   when there are any (the shoes rule depends on it) and a closet that can
 *   form a look still can after the trim.
 * - Ties keep the order sent (the app sends the most recent first). The kept
 *   items are returned in the order sent.
 *
 * Plain TypeScript, no Deno APIs; Jest-tested. Never logs anything.
 */
import type { ClosetItemSummary, WeatherSummary } from '../_shared/generate-outfits-contract.ts';
import { TAG_CATEGORIES, type TagCategory, type TagSeason } from '../_shared/tag-item-contract.ts';

/** Most items that reach the prompt. */
export const PREFILTER_MAX_ITEMS = 120;

/** Places per category before leftovers are shared out; sums to PREFILTER_MAX_ITEMS. */
export const CATEGORY_QUOTAS: Readonly<Record<TagCategory, number>> = {
  top: 30,
  bottom: 22,
  dress: 16,
  outerwear: 12,
  shoes: 14,
  accessory: 26,
};

/** Words that point to a season. */
const SEASON_WORDS: Readonly<Record<TagSeason, readonly string[]>> = {
  spring: ['spring', 'easter', 'mild'],
  summer: ['summer', 'hot', 'heat', 'beach', 'sunny', 'sun', 'pool', 'festival', 'tropical', 'warm', 'vacation', 'holiday'],
  autumn: ['autumn', 'fall', 'halloween', 'cozy', 'cosy', 'crisp'],
  winter: ['winter', 'cold', 'snow', 'snowy', 'freezing', 'christmas', 'ski', 'skiing', 'chilly', 'icy'],
};

/** Words that point to a formality. */
const FORMALITY_WORDS: Readonly<Record<string, readonly string[]>> = {
  formal: ['formal', 'wedding', 'gala', 'black-tie', 'tie', 'interview', 'funeral', 'elegant', 'office', 'business', 'suit', 'opera'],
  'smart-casual': ['date', 'dinner', 'smart', 'work', 'office', 'brunch', 'party', 'meeting', 'restaurant', 'theatre', 'theater'],
  casual: ['casual', 'relaxed', 'weekend', 'chill', 'errands', 'everyday', 'lazy', 'home', 'comfy', 'comfortable'],
  athletic: ['gym', 'sport', 'sports', 'running', 'run', 'workout', 'hike', 'hiking', 'yoga', 'training', 'athletic', 'active'],
};

/** Common words that say nothing about clothes. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'something', 'some', 'look', 'looks', 'outfit', 'outfits', 'wear', 'what', 'that', 'this',
  'from', 'want', 'need', 'like', 'into', 'your', 'you', 'have', 'going', 'out', 'day', 'night', 'get', 'give', 'make',
  'please', 'very', 'more', 'less', 'not', 'but', 'too', 'can', 'just', 'any', 'all', 'my', 'me', 'a', 'an', 'to', 'of',
  'in', 'on', 'at', 'is', 'it', 'be', 'or', 'vibes', 'vibe', 'style', 'styled',
]);

/** Lowercase words of 2+ letters (any script), with hyphenated words kept whole and split. */
export function wordsOf(text: string): string[] {
  const words = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []) {
    words.add(raw);
    if (raw.includes('-')) for (const part of raw.split('-')) words.add(part);
  }
  return [...words].filter((word) => word.length >= 2);
}

/** What a request points to, read once per request. */
export interface RequestHints {
  /** Words worth matching against item text (stop words removed). */
  words: ReadonlySet<string>;
  seasons: ReadonlySet<TagSeason>;
  formalities: ReadonlySet<string>;
}

export function requestHints(request: string, weather?: WeatherSummary): RequestHints {
  const all = wordsOf(request);
  const words = new Set(all.filter((word) => !STOP_WORDS.has(word)));
  const seasons = new Set<TagSeason>();
  for (const [season, list] of Object.entries(SEASON_WORDS) as [TagSeason, readonly string[]][]) {
    if (list.some((word) => words.has(word))) seasons.add(season);
  }
  if (weather) {
    const mid = (weather.highC + weather.lowC) / 2;
    if (weather.highC >= 24) seasons.add('summer');
    else if (mid <= 6) seasons.add('winter');
    else {
      seasons.add('spring');
      seasons.add('autumn');
    }
  }
  const formalities = new Set<string>();
  for (const [formality, list] of Object.entries(FORMALITY_WORDS)) {
    if (list.some((word) => words.has(word))) formalities.add(formality);
  }
  return { words, seasons, formalities };
}

/** How well an item fits the request; higher is better, 0 is neutral. */
export function scoreItem(item: ClosetItemSummary, hints: RequestHints): number {
  let score = 0;
  const own = new Set([
    ...wordsOf([item.name ?? '', item.type ?? '', ...(item.tags ?? [])].join(' ')),
    ...item.colors.flatMap((color) => wordsOf(color)),
    ...[item.pattern ?? '', item.material ?? ''].flatMap((text) => wordsOf(text)),
  ]);
  for (const word of hints.words) if (own.has(word)) score += 3;
  if (hints.seasons.size > 0 && item.seasons.length > 0) {
    score += item.seasons.some((season) => hints.seasons.has(season)) ? 2 : -2;
  }
  if (hints.formalities.size > 0 && item.formality) {
    score += hints.formalities.has(item.formality) ? 2 : 0;
  }
  return score;
}

export interface Prefiltered {
  /** The items that reach the prompt, in the order sent. */
  items: ClosetItemSummary[];
  /** How many items sent were left out. */
  omitted: number;
}

/** Trims the closet for the prompt (see the file comment). Deterministic. */
export function prefilterCloset(
  items: readonly ClosetItemSummary[],
  request: string,
  weather?: WeatherSummary,
  max: number = PREFILTER_MAX_ITEMS,
): Prefiltered {
  if (items.length <= max) return { items: [...items], omitted: 0 };
  const hints = requestHints(request, weather);
  const ranked = items
    .map((item, index) => ({ item, index, score: scoreItem(item, hints) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const keep = new Set<number>();
  // Every category present keeps its best item first, whatever the quotas.
  for (const category of TAG_CATEGORIES) {
    const best = ranked.find((entry) => entry.item.category === category);
    if (best && keep.size < max) keep.add(best.index);
  }
  const scale = max / PREFILTER_MAX_ITEMS;
  for (const category of TAG_CATEGORIES) {
    const quota = Math.floor(CATEGORY_QUOTAS[category] * scale);
    let taken = ranked.filter((entry) => entry.item.category === category && keep.has(entry.index)).length;
    for (const entry of ranked) {
      if (taken >= quota || keep.size >= max) break;
      if (entry.item.category !== category || keep.has(entry.index)) continue;
      keep.add(entry.index);
      taken++;
    }
  }
  for (const entry of ranked) {
    if (keep.size >= max) break;
    keep.add(entry.index);
  }
  const kept = items.filter((_, index) => keep.has(index));
  return { items: kept, omitted: items.length - kept.length };
}
