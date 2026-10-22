/**
 * Reads the model's reply (a Messages API response body) into contract tags.
 *
 * - `stop_reason` is checked first: `refusal` and `max_tokens` (and anything
 *   but `end_turn` / `stop_sequence`) count as malformed.
 * - The first `text` block must be a JSON object.
 * - Each field is checked on its own (`readModelTags`). A missing, malformed
 *   or out-of-list field becomes null (lists keep only their valid, unique
 *   entries) and is reported as a problem, so the caller can retry once and
 *   then answer with what is valid.
 *
 * Never returns or logs the reply text.
 */
import {
  readTagType,
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_MAX_COLORS,
  TAG_PATTERNS,
  TAG_SEASONS,
  type ItemTags,
} from '../_shared/tag-item-contract.ts';

import { MODEL_TAG_KEYS } from './prompt.ts';

export const EMPTY_TAGS: Readonly<ItemTags> = Object.freeze({
  category: null,
  colors: [],
  seasons: [],
  type: null,
  pattern: null,
  material: null,
  fit: null,
  formality: null,
});

/** Tags read from a reply, plus what was wrong with it (empty when it was fully valid). */
export interface ReadTags {
  tags: ItemTags;
  /** Field names (or `extra keys`) that were missing, malformed or out of list. */
  problems: string[];
}

export type ModelReply =
  | ({ kind: 'tags' } & ReadTags)
  | { kind: 'malformed'; reason: 'refusal' | 'max_tokens' | 'stop_reason' | 'no_text' | 'not_json' | 'not_object' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** null when absent or null; the value when in the list; `undefined` (a problem) otherwise. */
function readChoice<T extends string>(values: readonly T[], value: unknown): T | null | undefined {
  if (value === null) return null;
  return isOneOf(values, value) ? value : undefined;
}

/** Valid, unique entries in order (at most `max`) and whether anything was dropped for being invalid. */
function readList<T extends string>(values: readonly T[], value: unknown, max: number): { list: T[]; bad: boolean } {
  if (!Array.isArray(value)) return { list: [], bad: true };
  const list: T[] = [];
  let bad = false;
  for (const entry of value) {
    if (!isOneOf(values, entry)) {
      bad = true;
      continue;
    }
    if (!list.includes(entry) && list.length < max) list.push(entry);
  }
  return { list, bad };
}

/** Checks a parsed JSON object field by field. */
export function readModelTags(raw: Record<string, unknown>): ReadTags {
  const problems: string[] = [];
  for (const key of MODEL_TAG_KEYS) if (!(key in raw)) problems.push(key);
  if (Object.keys(raw).some((key) => !(MODEL_TAG_KEYS as readonly string[]).includes(key))) problems.push('extra keys');

  const choice = <T extends string>(name: string, values: readonly T[]): T | null => {
    if (!(name in raw)) return null;
    const read = readChoice(values, raw[name]);
    if (read === undefined) {
      problems.push(name);
      return null;
    }
    return read;
  };
  const listOf = <T extends string>(name: string, values: readonly T[], max: number): T[] => {
    if (!(name in raw)) return [];
    const { list, bad } = readList(values, raw[name], max);
    if (bad) problems.push(name);
    return list;
  };

  let type: string | null = null;
  if ('type' in raw && raw.type !== null) {
    type = readTagType(raw.type);
    if (type === null) problems.push('type');
  }

  const tags: ItemTags = {
    category: choice('category', TAG_CATEGORIES),
    colors: listOf('colors', TAG_COLORS, TAG_MAX_COLORS),
    seasons: listOf('seasons', TAG_SEASONS, TAG_SEASONS.length),
    type,
    pattern: choice('pattern', TAG_PATTERNS),
    material: choice('material', TAG_MATERIALS),
    fit: choice('fit', TAG_FITS),
    formality: choice('formality', TAG_FORMALITIES),
  };
  return { tags, problems: [...new Set(problems)] };
}

/** Reads a Messages API response body (already parsed from JSON). */
export function readModelReply(body: unknown): ModelReply {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'no_text' };
  const stop = body.stop_reason;
  if (stop === 'refusal') return { kind: 'malformed', reason: 'refusal' };
  if (stop === 'max_tokens') return { kind: 'malformed', reason: 'max_tokens' };
  if (stop !== 'end_turn' && stop !== 'stop_sequence') return { kind: 'malformed', reason: 'stop_reason' };
  const content = Array.isArray(body.content) ? body.content : [];
  const block = content.find((b): b is { type: 'text'; text: string } => isRecord(b) && b.type === 'text' && typeof b.text === 'string');
  if (!block) return { kind: 'malformed', reason: 'no_text' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return { kind: 'malformed', reason: 'not_json' };
  }
  if (!isRecord(parsed)) return { kind: 'malformed', reason: 'not_object' };
  return { kind: 'tags', ...readModelTags(parsed) };
}
