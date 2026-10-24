/**
 * generate-outfits API contract: request and response types, limits,
 * validators, and the stub's answer.
 *
 * THE SOURCE OF TRUTH. `spotlight/src/ai/generate-outfits-contract.ts` is a
 * byte-for-byte copy (the Expo app cannot import from `supabase/`); a Jest
 * test fails when the two drift. Edit this file, then copy it over.
 *
 * Plain TypeScript. Its only import is the sibling tag-item contract (the
 * shared vocabulary), which sits next to it in both places, so it runs
 * unchanged in Deno (the edge function), in React Native (the app) and in
 * Jest (the tests). Documented in `docs/api/generate-outfits.md`.
 *
 * The composition rules that judge a model's outfits live only in the
 * function (`generate-outfits/outfit-rules.ts`). This file holds what both
 * sides need: shapes, caps, `missingForOutfit` (the not_enough_items check,
 * which the app also runs to skip a pointless call) and `stubOutfits` (the
 * stub's answer, which the app's mock generator repeats).
 */
import {
  readTagItemUsage,
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_ITEM_ERROR_CODES,
  TAG_MATERIALS,
  TAG_PATTERNS,
  TAG_SEASONS,
  TAG_TYPE_MAX_LENGTH,
  type TagCategory,
  type TagColor,
  type TagFit,
  type TagFormality,
  type TagItemUsage,
  type TagMaterial,
  type TagPattern,
  type TagSeason,
  type Validation,
} from './tag-item-contract.ts';

/** Bumped when the request or response shape changes incompatibly. */
export const GENERATE_OUTFITS_API_VERSION = 1;

/** Longest request text, in characters (code points) after trimming and collapsing whitespace. */
export const OUTFIT_REQUEST_MAX_LENGTH = 200;
/** Fewest and most closet items per request. */
export const OUTFIT_MIN_ITEMS = 1;
export const OUTFIT_MAX_ITEMS = 300;

/** Item id: 1 to 64 characters from `A-Z a-z 0-9 . _ : -` (the app's ids are `<time36>-<random36>`). */
export const SUMMARY_ID_MAX_LENGTH = 64;
const SUMMARY_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
/** Caps on summary text, in characters (code points) after trimming and collapsing whitespace. */
export const SUMMARY_NAME_MAX_LENGTH = 60;
export const SUMMARY_TYPE_MAX_LENGTH = TAG_TYPE_MAX_LENGTH;
export const SUMMARY_TAG_MAX_LENGTH = 30;
export const SUMMARY_MAX_TAGS = 10;
export const SUMMARY_MAX_COLORS = 3;

/**
 * What the request is for (Gate 3 slice 5). `request`: the user's text
 * (required, 1 to 200 characters). `weather`: dress for `weather` (required
 * in this mode); the text is optional. `random`: a surprise look; the text
 * is optional. Missing means `request`. The slice 1 stub ignores mode and
 * weather.
 */
export const OUTFIT_MODES = ['request', 'weather', 'random'] as const;
export type OutfitMode = (typeof OUTFIT_MODES)[number];

/** Bounds for the weather summary (never coordinates). */
export const WEATHER_TEMP_MIN_C = -80;
export const WEATHER_TEMP_MAX_C = 70;
export const WEATHER_WIND_MAX_KPH = 400;
export const WEATHER_CONDITIONS_MAX_LENGTH = 40;

/** Most outfits in one answer. */
export const MAX_OUTFITS = 3;
/** Longest rationale, in characters (code points) after trimming and collapsing whitespace. */
export const OUTFIT_RATIONALE_MAX_LENGTH = 300;
/** Most accessories in one outfit (D3). */
export const OUTFIT_MAX_ACCESSORIES = 5;
/** Most items in one outfit: top, bottom, shoes, outerwear and 5 accessories. */
export const OUTFIT_MAX_PIECES = 4 + OUTFIT_MAX_ACCESSORIES;

/**
 * Largest accepted request body in bytes. A summary at every cap, written by
 * `JSON.stringify` with 4-byte characters in every text field, is under
 * 2,000 bytes; 300 of them plus the request text and weather fit in 650,000
 * (checked by a test).
 */
export const GENERATE_OUTFITS_MAX_BODY_BYTES = 650_000;

/** One closet item as text: ids and tags only, never photos. */
export interface ClosetItemSummary {
  id: string;
  category: TagCategory;
  /** Palette color ids, primary first, no duplicates, at most 3. */
  colors: TagColor[];
  /** No duplicates. */
  seasons: TagSeason[];
  name?: string;
  type?: string;
  pattern?: TagPattern;
  material?: TagMaterial;
  fit?: TagFit;
  formality?: TagFormality;
  /** The user's own tags, lowercase, no duplicates, at most 10. */
  tags?: string[];
}

/** Today's weather, summarized by our backend or the app (slice 5). */
export interface WeatherSummary {
  highC: number;
  lowC: number;
  /** Percent, 0 to 100. */
  rainChance: number;
  windKph: number;
  /** Short text ("Light rain"), 1 to 40 characters. */
  conditions: string;
}

export interface GenerateOutfitsRequest {
  /** The user's words. May be empty only when mode is `weather` or `random`. */
  request: string;
  items: ClosetItemSummary[];
  mode?: OutfitMode;
  weather?: WeatherSummary;
}

/** A request after validation: text normalized, mode filled in. */
export interface ValidGenerateOutfitsRequest extends GenerateOutfitsRequest {
  mode: OutfitMode;
}

export interface GeneratedOutfit {
  /** Closet item ids, in category order (top, bottom, dress, outerwear, shoes, accessories). */
  itemIds: string[];
  /** Why the look works, 1 to 300 characters. */
  rationale: string;
}

export interface GenerateOutfitsResponse {
  apiVersion: number;
  /** 0 to 3 valid, distinct outfits. */
  outfits: GeneratedOutfit[];
  /** True for the stub's canned picks (slice 1, the app's mock); false for real model answers. */
  stub: boolean;
  /** Optional: what the model calls cost (same shape as tag-item's); absent from the stub. */
  usage?: GenerateOutfitsUsage;
}

export type GenerateOutfitsUsage = TagItemUsage;

export const GENERATE_OUTFITS_ERROR_CODES = [
  ...TAG_ITEM_ERROR_CODES,
  /** The closet sent cannot form any outfit: no dress and no top and bottom pair. */
  'not_enough_items',
] as const;
export type GenerateOutfitsErrorCode = (typeof GENERATE_OUTFITS_ERROR_CODES)[number];

/** The pieces an outfit is built around; `missing` lists those the closet has none of. */
export const OUTFIT_BASE_PIECES = ['top', 'bottom', 'dress'] as const;
export type OutfitBasePiece = (typeof OUTFIT_BASE_PIECES)[number];

export interface GenerateOutfitsErrorResponse {
  error: {
    code: GenerateOutfitsErrorCode;
    message: string;
    /** Only with `not_enough_items`: which of top, bottom and dress the closet has none of. */
    missing?: OutfitBasePiece[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function codePoints(text: string): number {
  return [...text].length;
}

/** True when the text has a C0 or C1 control character (after whitespace is collapsed). */
function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Trims and collapses every whitespace run (line breaks, tabs) to one space. */
export function normalizeOutfitText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Normalized text of 0..max (or min..max) characters with no control characters, or null. */
function readText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = normalizeOutfitText(value);
  const length = codePoints(text);
  if (length < min || length > max || hasControlCharacter(text)) return null;
  return text;
}

function readList<T extends string>(list: readonly T[], value: unknown, max: number): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  if (!value.every((entry) => isOneOf(list, entry))) return null;
  if (new Set(value).size !== value.length) return null;
  return [...value] as T[];
}

/** Whether a value is a well-formed item id. */
export function isSummaryId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SUMMARY_ID_MAX_LENGTH && SUMMARY_ID_PATTERN.test(value);
}

/** Absent (undefined or null) or a valid value. */
type Optional<T> = { ok: true; value: T | undefined } | { ok: false };

function optionalField<T>(value: unknown, read: (v: unknown) => T | null): Optional<T> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const read_ = read(value);
  return read_ === null ? { ok: false } : { ok: true, value: read_ };
}

/** Checks one summary; returns it with text normalized and tags deduplicated, or the reason. */
export function validateClosetItemSummary(value: unknown): Validation<ClosetItemSummary> {
  if (!isRecord(value)) return { ok: false, reason: 'must be an object' };
  if (!isSummaryId(value.id)) return { ok: false, reason: 'id must be 1 to 64 characters of A-Z a-z 0-9 . _ : -' };
  if (!isOneOf(TAG_CATEGORIES, value.category)) return { ok: false, reason: 'unknown category' };
  const colors = readList(TAG_COLORS, value.colors, SUMMARY_MAX_COLORS);
  if (!colors) return { ok: false, reason: 'colors must be at most 3 distinct palette ids' };
  const seasons = readList(TAG_SEASONS, value.seasons, TAG_SEASONS.length);
  if (!seasons) return { ok: false, reason: 'seasons must be distinct seasons' };

  const summary: ClosetItemSummary = { id: value.id, category: value.category, colors, seasons };
  const name = optionalField(value.name, (v) => readText(v, 1, SUMMARY_NAME_MAX_LENGTH));
  if (!name.ok) return { ok: false, reason: `name must be 1 to ${SUMMARY_NAME_MAX_LENGTH} characters` };
  if (name.value !== undefined) summary.name = name.value;
  const type = optionalField(value.type, (v) => readText(v, 1, SUMMARY_TYPE_MAX_LENGTH));
  if (!type.ok) return { ok: false, reason: `type must be 1 to ${SUMMARY_TYPE_MAX_LENGTH} characters` };
  if (type.value !== undefined) summary.type = type.value;

  const pattern = optionalField(value.pattern, (v) => (isOneOf(TAG_PATTERNS, v) ? v : null));
  if (!pattern.ok) return { ok: false, reason: 'unknown pattern' };
  if (pattern.value !== undefined) summary.pattern = pattern.value;
  const material = optionalField(value.material, (v) => (isOneOf(TAG_MATERIALS, v) ? v : null));
  if (!material.ok) return { ok: false, reason: 'unknown material' };
  if (material.value !== undefined) summary.material = material.value;
  const fit = optionalField(value.fit, (v) => (isOneOf(TAG_FITS, v) ? v : null));
  if (!fit.ok) return { ok: false, reason: 'unknown fit' };
  if (fit.value !== undefined) summary.fit = fit.value;
  const formality = optionalField(value.formality, (v) => (isOneOf(TAG_FORMALITIES, v) ? v : null));
  if (!formality.ok) return { ok: false, reason: 'unknown formality' };
  if (formality.value !== undefined) summary.formality = formality.value;

  const tags = optionalField(value.tags, readTags);
  if (!tags.ok) {
    return { ok: false, reason: `tags must be at most ${SUMMARY_MAX_TAGS} texts of 1 to ${SUMMARY_TAG_MAX_LENGTH} characters` };
  }
  if (tags.value !== undefined && tags.value.length > 0) summary.tags = tags.value;
  return { ok: true, value: summary };
}

function readTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > SUMMARY_MAX_TAGS) return null;
  const tags: string[] = [];
  for (const entry of value) {
    const tag = readText(entry, 1, SUMMARY_TAG_MAX_LENGTH);
    if (tag === null) return null;
    const lower = tag.toLowerCase();
    if (!tags.includes(lower)) tags.push(lower);
  }
  return tags;
}

function isNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateWeatherSummary(value: unknown): Validation<WeatherSummary> {
  if (!isRecord(value)) return { ok: false, reason: 'weather must be an object' };
  const { highC, lowC, rainChance, windKph } = value;
  if (!isNumberIn(highC, WEATHER_TEMP_MIN_C, WEATHER_TEMP_MAX_C) || !isNumberIn(lowC, WEATHER_TEMP_MIN_C, WEATHER_TEMP_MAX_C)) {
    return { ok: false, reason: `weather temperatures must be ${WEATHER_TEMP_MIN_C} to ${WEATHER_TEMP_MAX_C} C` };
  }
  if (lowC > highC) return { ok: false, reason: 'weather lowC must not be above highC' };
  if (!isNumberIn(rainChance, 0, 100)) return { ok: false, reason: 'weather rainChance must be 0 to 100' };
  if (!isNumberIn(windKph, 0, WEATHER_WIND_MAX_KPH)) return { ok: false, reason: `weather windKph must be 0 to ${WEATHER_WIND_MAX_KPH}` };
  const conditions = readText(value.conditions, 1, WEATHER_CONDITIONS_MAX_LENGTH);
  if (conditions === null) return { ok: false, reason: `weather conditions must be 1 to ${WEATHER_CONDITIONS_MAX_LENGTH} characters` };
  return { ok: true, value: { highC, lowC, rainChance, windKph, conditions } };
}

/**
 * Checks a parsed request body. Returns the request with its text and
 * summaries normalized and `mode` filled in. Unknown extra fields are
 * ignored. Duplicate item ids reject the request.
 */
export function validateGenerateOutfitsRequest(body: unknown): Validation<ValidGenerateOutfitsRequest> {
  if (!isRecord(body)) return { ok: false, reason: 'Body must be a JSON object.' };
  let mode: OutfitMode = 'request';
  if (body.mode !== undefined) {
    if (!isOneOf(OUTFIT_MODES, body.mode)) return { ok: false, reason: 'mode must be "request", "weather" or "random".' };
    mode = body.mode;
  }
  const request = readText(body.request, mode === 'request' ? 1 : 0, OUTFIT_REQUEST_MAX_LENGTH);
  if (request === null) {
    return {
      ok: false,
      reason:
        mode === 'request'
          ? `request must be 1 to ${OUTFIT_REQUEST_MAX_LENGTH} characters of text.`
          : `request must be text of at most ${OUTFIT_REQUEST_MAX_LENGTH} characters.`,
    };
  }
  let weather: WeatherSummary | undefined;
  if (body.weather !== undefined && body.weather !== null) {
    const valid = validateWeatherSummary(body.weather);
    if (!valid.ok) return { ok: false, reason: `${valid.reason}.` };
    weather = valid.value;
  }
  if (mode === 'weather' && !weather) return { ok: false, reason: 'mode "weather" needs weather.' };

  const { items } = body;
  if (!Array.isArray(items) || items.length < OUTFIT_MIN_ITEMS || items.length > OUTFIT_MAX_ITEMS) {
    return { ok: false, reason: `items must be a list of ${OUTFIT_MIN_ITEMS} to ${OUTFIT_MAX_ITEMS} summaries.` };
  }
  const summaries: ClosetItemSummary[] = [];
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    const valid = validateClosetItemSummary(item);
    if (!valid.ok) return { ok: false, reason: `items[${index}]: ${valid.reason}.` };
    if (ids.has(valid.value.id)) return { ok: false, reason: `items[${index}]: duplicate id.` };
    ids.add(valid.value.id);
    summaries.push(valid.value);
  }
  return { ok: true, value: { request, items: summaries, mode, ...(weather ? { weather } : {}) } };
}

/**
 * Which of top, bottom and dress the closet has none of, when that means no
 * outfit can be formed (no dress and no top and bottom pair); empty when an
 * outfit is possible. Shoes, outerwear and accessories never block a look.
 */
export function missingForOutfit(items: readonly { category: string }[]): OutfitBasePiece[] {
  const has = (category: OutfitBasePiece) => items.some((item) => item.category === category);
  if (has('dress') || (has('top') && has('bottom'))) return [];
  return OUTFIT_BASE_PIECES.filter((piece) => !has(piece));
}

export function canFormOutfit(items: readonly { category: string }[]): boolean {
  return missingForOutfit(items).length === 0;
}

/**
 * The stub's answer: up to 3 distinct looks picked in closet order, first
 * every top and bottom pair (top by top), then every dress, each with the
 * next pair of shoes in turn when the closet has shoes, and nothing else.
 * Deterministic; no outerwear or accessories; the rationale names only
 * categories (no user text).
 */
export function stubOutfits(items: readonly ClosetItemSummary[]): GeneratedOutfit[] {
  const of = (category: TagCategory) => items.filter((item) => item.category === category);
  const shoes = of('shoes');
  const outfits: GeneratedOutfit[] = [];
  const add = (base: ClosetItemSummary[]): boolean => {
    const pair = shoes.length > 0 ? [shoes[outfits.length % shoes.length]] : [];
    const pieces = [...base, ...pair];
    outfits.push({
      itemIds: pieces.map((piece) => piece.id),
      rationale: `Stub look ${outfits.length + 1}: ${pieces.map((piece) => piece.category).join(' + ')}.`,
    });
    return outfits.length >= MAX_OUTFITS;
  };
  for (const top of of('top')) {
    for (const bottom of of('bottom')) {
      if (add([top, bottom])) return outfits;
    }
  }
  for (const dress of of('dress')) {
    if (add([dress])) return outfits;
  }
  return outfits;
}

function readOutfit(value: unknown): GeneratedOutfit | null {
  if (!isRecord(value)) return null;
  const { itemIds } = value;
  if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > OUTFIT_MAX_PIECES) return null;
  if (!itemIds.every((id) => typeof id === 'string' && id.length > 0)) return null;
  if (new Set(itemIds).size !== itemIds.length) return null;
  const rationale = readText(value.rationale, 1, OUTFIT_RATIONALE_MAX_LENGTH);
  if (rationale === null) return null;
  return { itemIds: [...(itemIds as string[])], rationale };
}

/**
 * Checks a parsed 200 body (shape only; the app then drops any outfit with
 * an id it did not send). Any malformed outfit, or more than 3, rejects the
 * whole response. Unknown fields are ignored and `usage` is dropped.
 */
export function validateGenerateOutfitsResponse(body: unknown): Validation<GenerateOutfitsResponse> {
  if (!isRecord(body)) return { ok: false, reason: 'Response must be a JSON object.' };
  const { apiVersion, outfits, stub } = body;
  if (apiVersion !== GENERATE_OUTFITS_API_VERSION) return { ok: false, reason: 'Unsupported apiVersion.' };
  if (typeof stub !== 'boolean') return { ok: false, reason: 'stub must be a boolean.' };
  if (!Array.isArray(outfits) || outfits.length > MAX_OUTFITS) return { ok: false, reason: 'outfits must be a list of at most 3.' };
  const read: GeneratedOutfit[] = [];
  for (const outfit of outfits) {
    const valid = readOutfit(outfit);
    if (!valid) return { ok: false, reason: 'Malformed outfit.' };
    read.push(valid);
  }
  return { ok: true, value: { apiVersion, outfits: read, stub } };
}

/** Reads `usage` from a 200 body, or null when it is missing or malformed. */
export function readGenerateOutfitsUsage(body: unknown): GenerateOutfitsUsage | null {
  return readTagItemUsage(body);
}

/**
 * Reads an error body: its code (null when it is not a known one) and, for
 * `not_enough_items`, the valid entries of `missing`.
 */
export function readGenerateOutfitsError(body: unknown): { code: GenerateOutfitsErrorCode; missing: OutfitBasePiece[] } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, missing } = body.error;
  if (!isOneOf(GENERATE_OUTFITS_ERROR_CODES, code)) return null;
  const pieces = Array.isArray(missing) ? OUTFIT_BASE_PIECES.filter((piece) => missing.includes(piece)) : [];
  return { code, missing: code === 'not_enough_items' ? pieces : [] };
}
