/**
 * User-defined style tags ("90s", "emo", "work"). Free-form labels the user
 * types, separate from the fixed category, colors, and seasons, and from the
 * AI tags that arrive in Gate 2.
 *
 * Normalized form (what is stored and shown): trimmed, inner whitespace
 * collapsed to one space, and lowercased. Lowercase is the display form too,
 * like colors: "Emo", "EMO" and " emo " are all the tag "emo". Keeping a single
 * form means the stored name is also the unique key, so there is no
 * first-entered-casing ambiguity when two items spell a tag differently.
 */

/** Longest tag, in characters (code points) after normalization. */
export const TAG_MAX_LENGTH = 30;
/** Most tags one item can have. */
export const MAX_TAGS_PER_ITEM = 10;

/** A saved tag and how many items currently use it. */
export interface TagSummary {
  name: string;
  itemCount: number;
}

export type TagProblem = 'empty' | 'too_long' | 'too_many';

export const TAG_MESSAGES: Readonly<Record<TagProblem, string>> = Object.freeze({
  empty: 'Type a tag first.',
  too_long: `Tags can be at most ${TAG_MAX_LENGTH} characters.`,
  too_many: `An item can have at most ${MAX_TAGS_PER_ITEM} tags.`,
});

/** Trim, collapse inner whitespace, lowercase. No length checks (used for filtering too). */
export function canonicalTagText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function length(text: string): number {
  return [...text].length;
}

export type NormalizeTagResult = { ok: true; tag: string } | { ok: false; problem: TagProblem };

/** Normalizes user input into a tag, or says why it is not one. */
export function normalizeTag(raw: string): NormalizeTagResult {
  const tag = canonicalTagText(typeof raw === 'string' ? raw : '');
  if (tag.length === 0) return { ok: false, problem: 'empty' };
  if (length(tag) > TAG_MAX_LENGTH) return { ok: false, problem: 'too_long' };
  return { ok: true, tag };
}

/** True if `value` is a string already in normalized tag form. */
export function isNormalizedTag(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const result = normalizeTag(value);
  return result.ok && result.tag === value;
}

export type TagListResult = { ok: true; tags: string[] } | { ok: false; problem: TagProblem };

/**
 * Adds `raw` (normalized) to an item's tags. Adding a tag that is already
 * there is a success that changes nothing. Never mutates `current`.
 */
export function addTag(current: readonly string[], raw: string): TagListResult {
  const normalized = normalizeTag(raw);
  if (!normalized.ok) return normalized;
  if (current.includes(normalized.tag)) return { ok: true, tags: [...current] };
  if (current.length >= MAX_TAGS_PER_ITEM) return { ok: false, problem: 'too_many' };
  return { ok: true, tags: [...current, normalized.tag] };
}

/** Removes `tag` (compared in normalized form). Never mutates `current`. */
export function removeTag(current: readonly string[], tag: string): string[] {
  const key = canonicalTagText(tag);
  return current.filter((t) => t !== key);
}

/** Removes `tag` if present, otherwise adds it (subject to the same limits as `addTag`). */
export function toggleTag(current: readonly string[], tag: string): TagListResult {
  const key = canonicalTagText(tag);
  return current.includes(key) ? { ok: true, tags: removeTag(current, key) } : addTag(current, tag);
}

/** Saved tags that contain what the user typed (normalized). Empty query matches all. Keeps order. */
export function filterTags<T extends string | TagSummary>(saved: readonly T[], query: string): T[] {
  const needle = canonicalTagText(query);
  if (needle.length === 0) return [...saved];
  return saved.filter((t) => (typeof t === 'string' ? t : t.name).includes(needle));
}

/** Same tags regardless of order. */
export function sameTagSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...right].every((t) => left.has(t));
}

/** Deterministic order for tag lists: by UTF-16 code units, the same in every implementation. */
export function compareTagNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Text for the "delete this tag from your list?" confirmation. */
export function describeTagDeletion(summary: TagSummary): string {
  const usage =
    summary.itemCount === 0
      ? 'No items use it.'
      : `It will be removed from ${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}.`;
  return `${usage} The items themselves are kept. This cannot be undone.`;
}
