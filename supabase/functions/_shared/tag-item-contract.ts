/**
 * tag-item API contract: request and response types, limits, and validators.
 *
 * THE SOURCE OF TRUTH. `spotlight/src/ai/tag-item-contract.ts` is a byte-for-
 * byte copy (the Expo app cannot import from `supabase/`); a Jest test fails
 * when the two drift. Edit this file, then copy it over.
 *
 * Plain TypeScript with no imports, so it runs unchanged in Deno (the edge
 * function), in React Native (the app) and in Jest (the tests).
 * Documented in `docs/api/tag-item.md`.
 */

/** Bumped when the request or response shape changes incompatibly. */
export const TAG_ITEM_API_VERSION = 1;

/** The only image type accepted. The app re-encodes every photo as JPEG. */
export const TAG_ITEM_CONTENT_TYPES = ['image/jpeg'] as const;
export type TagItemContentType = (typeof TAG_ITEM_CONTENT_TYPES)[number];

/** Longest accepted base64 image string (about 1.5 MB of JPEG). */
export const TAG_ITEM_MAX_IMAGE_BASE64_LENGTH = 2_000_000;
/** Largest accepted request body in bytes (the image plus JSON overhead). */
export const TAG_ITEM_MAX_BODY_BYTES = 2_100_000;

export interface TagItemRequest {
  /** The photo as standard base64 (no `data:` prefix, no line breaks). */
  imageBase64: string;
  contentType: TagItemContentType;
}

/** Same lists as the app's `CATEGORIES`, `PALETTE_IDS` and `SEASONS` (drift-tested). */
export const TAG_CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'] as const;
export const TAG_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const TAG_COLORS = [
  'black',
  'charcoal',
  'grey',
  'light-grey',
  'white',
  'cream',
  'beige',
  'tan',
  'camel',
  'brown',
  'navy',
  'denim-blue',
  'blue',
  'sky-blue',
  'teal',
  'green',
  'forest-green',
  'olive',
  'sage',
  'yellow',
  'mustard',
  'orange',
  'red',
  'burgundy',
  'pink',
  'purple',
  'lavender',
] as const;

/** Same lists and limit as the app's `PATTERNS`, `MATERIALS`, `FITS`, `FORMALITIES`, `ITEM_TYPE_MAX_LENGTH` (drift-tested). */
export const TAG_PATTERNS = ['solid', 'striped', 'checked', 'floral', 'graphic', 'polka-dot', 'animal', 'other'] as const;
export const TAG_MATERIALS = ['cotton', 'denim', 'wool', 'knit', 'linen', 'silk', 'leather', 'synthetic', 'other'] as const;
export const TAG_FITS = ['slim', 'regular', 'relaxed', 'oversized'] as const;
export const TAG_FORMALITIES = ['athletic', 'casual', 'smart-casual', 'formal'] as const;
/** Longest type ("Hoodie"), in characters (code points), after trimming and collapsing whitespace. */
export const TAG_TYPE_MAX_LENGTH = 30;

export type TagCategory = (typeof TAG_CATEGORIES)[number];
export type TagSeason = (typeof TAG_SEASONS)[number];
export type TagColor = (typeof TAG_COLORS)[number];
export type TagPattern = (typeof TAG_PATTERNS)[number];
export type TagMaterial = (typeof TAG_MATERIALS)[number];
export type TagFit = (typeof TAG_FITS)[number];
export type TagFormality = (typeof TAG_FORMALITIES)[number];

/** At most this many colors, most prominent first. */
export const TAG_MAX_COLORS = 3;

/**
 * Suggested tags. Every field may be empty: `null` / `[]` means "no
 * suggestion". Clients ignore fields they do not know.
 *
 * The D6 fields (type, pattern, material, fit, formality; Gate 2 slice 2) are
 * lenient: a missing field (an older server), a value outside the list, or a
 * type that is empty or too long is read as `null` (dropped), and the rest
 * of the response is kept. category, colors and seasons are strict: a bad
 * value rejects the whole response.
 */
export interface ItemTags {
  category: TagCategory | null;
  /** Palette color ids, most prominent first, no duplicates. */
  colors: TagColor[];
  /** No duplicates. */
  seasons: TagSeason[];
  /** Short free text ("Hoodie"): trimmed, single spaces, 1 to TAG_TYPE_MAX_LENGTH characters. */
  type: string | null;
  pattern: TagPattern | null;
  material: TagMaterial | null;
  fit: TagFit | null;
  formality: TagFormality | null;
}

export interface TagItemResponse {
  apiVersion: number;
  tags: ItemTags;
  /**
   * True only for a fixed, canned answer (the slice 1-2 stub and the app's
   * mock tagger). The deployed function calls the model and answers false.
   */
  stub: boolean;
  /**
   * Optional (Gate 2 slice 4): what the model calls behind this answer cost,
   * for the tagging eval. The app ignores it (`validateTagItemResponse`
   * drops it); the eval reads it with `readTagItemUsage`.
   */
  usage?: TagItemUsage;
}

/**
 * Model usage behind one answer, summed over every call the function made
 * for it (the first call and the one retry, when there was one).
 */
export interface TagItemUsage {
  /** The model alias the function called, for example "claude-haiku-5-5". */
  model: string;
  /** Number of model calls made (1 or 2), including calls that failed. */
  attempts: number;
  /** Input tokens over all calls; a call that reported none counts 0. */
  inputTokens: number;
  /** Output tokens over all calls; a call that reported none counts 0. */
  outputTokens: number;
}

export const TAG_ITEM_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'too_large',
  /** Too many requests to this function instance in the current minute (429, best effort; see the API doc). */
  'rate_limited',
  'server_misconfigured',
  'internal',
  /** The model provider is down, overloaded (5xx, 529) or unreachable. */
  'upstream_unavailable',
  /** The model provider rate-limited the function (429). */
  'upstream_rate_limited',
  /** The model provider did not answer in time. */
  'upstream_timeout',
  /** The model provider refused the call itself (any other 4xx). */
  'upstream_rejected',
] as const;
export type TagItemErrorCode = (typeof TAG_ITEM_ERROR_CODES)[number];

export interface TagItemErrorResponse {
  error: { code: TagItemErrorCode; message: string };
}

/** The fixed answer of the stub (Gate 2 slices 1 and 2; now only the app's mock tagger). */
export const STUB_TAG_ITEM_RESPONSE: TagItemResponse = {
  apiVersion: TAG_ITEM_API_VERSION,
  tags: {
    category: 'top',
    colors: ['navy', 'white'],
    seasons: ['spring', 'autumn'],
    type: 'Shirt',
    pattern: 'striped',
    material: 'cotton',
    fit: 'regular',
    formality: 'casual',
  },
  stub: true,
};

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Base64 of the JPEG start-of-image marker FF D8 FF. */
const JPEG_BASE64_PREFIX = '/9j/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** Checks a parsed request body. Does not decode the image beyond its first bytes. */
export function validateTagItemRequest(body: unknown): Validation<TagItemRequest> {
  if (!isRecord(body)) return { ok: false, reason: 'Body must be a JSON object.' };
  const { imageBase64, contentType } = body;
  if (!isOneOf(TAG_ITEM_CONTENT_TYPES, contentType)) {
    return { ok: false, reason: 'contentType must be "image/jpeg".' };
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return { ok: false, reason: 'imageBase64 must be a non-empty string.' };
  }
  if (imageBase64.length > TAG_ITEM_MAX_IMAGE_BASE64_LENGTH) {
    return { ok: false, reason: 'imageBase64 is too large.' };
  }
  if (imageBase64.length % 4 !== 0 || !BASE64.test(imageBase64)) {
    return { ok: false, reason: 'imageBase64 must be standard base64.' };
  }
  if (!imageBase64.startsWith(JPEG_BASE64_PREFIX)) {
    return { ok: false, reason: 'imageBase64 is not a JPEG.' };
  }
  return { ok: true, value: { imageBase64, contentType } };
}

function validateList<T extends string>(list: readonly T[], value: unknown, max: number): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  if (!value.every((entry) => isOneOf(list, entry))) return null;
  if (new Set(value).size !== value.length) return null;
  return value as T[];
}

/**
 * Checks a parsed response body. Unknown extra fields are ignored (newer
 * servers may add tags). A bad category, color or season rejects the whole
 * response; a bad or missing D6 field (type, pattern, material, fit,
 * formality) is read as null (see `ItemTags`).
 */
export function validateTagItemResponse(body: unknown): Validation<TagItemResponse> {
  if (!isRecord(body)) return { ok: false, reason: 'Response must be a JSON object.' };
  const { apiVersion, tags, stub } = body;
  if (apiVersion !== TAG_ITEM_API_VERSION) return { ok: false, reason: 'Unsupported apiVersion.' };
  if (typeof stub !== 'boolean') return { ok: false, reason: 'stub must be a boolean.' };
  if (!isRecord(tags)) return { ok: false, reason: 'tags must be an object.' };
  let category: TagCategory | null = null;
  if (tags.category !== null) {
    if (!isOneOf(TAG_CATEGORIES, tags.category)) return { ok: false, reason: 'Unknown category.' };
    category = tags.category;
  }
  const colors = validateList(TAG_COLORS, tags.colors, TAG_MAX_COLORS);
  if (!colors) return { ok: false, reason: 'Invalid colors.' };
  const seasons = validateList(TAG_SEASONS, tags.seasons, TAG_SEASONS.length);
  if (!seasons) return { ok: false, reason: 'Invalid seasons.' };
  return {
    ok: true,
    value: {
      apiVersion,
      stub,
      tags: {
        category,
        colors,
        seasons,
        type: readTagType(tags.type),
        pattern: isOneOf(TAG_PATTERNS, tags.pattern) ? tags.pattern : null,
        material: isOneOf(TAG_MATERIALS, tags.material) ? tags.material : null,
        fit: isOneOf(TAG_FITS, tags.fit) ? tags.fit : null,
        formality: isOneOf(TAG_FORMALITIES, tags.formality) ? tags.formality : null,
      },
    },
  };
}

/** A suggested type, trimmed with single spaces, or null when missing, empty, or too long. */
export function readTagType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 0 && [...text].length <= TAG_TYPE_MAX_LENGTH ? text : null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Reads `usage` from a 200 body, or null when it is missing or malformed. */
export function readTagItemUsage(body: unknown): TagItemUsage | null {
  if (!isRecord(body) || !isRecord(body.usage)) return null;
  const { model, attempts, inputTokens, outputTokens } = body.usage;
  if (typeof model !== 'string' || model.length === 0) return null;
  if (!isCount(attempts) || !isCount(inputTokens) || !isCount(outputTokens)) return null;
  return { model, attempts, inputTokens, outputTokens };
}

/** Reads the error code from an error body, or null when it is not one. */
export function tagItemErrorCode(body: unknown): TagItemErrorCode | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code } = body.error;
  return isOneOf(TAG_ITEM_ERROR_CODES, code) ? code : null;
}
