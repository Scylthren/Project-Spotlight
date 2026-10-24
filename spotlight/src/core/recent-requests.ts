/**
 * The Style screen's recent requests (Gate 3 slice 2): the last 5 the user
 * sent, newest first, kept on the phone only. A request sent again moves to
 * the top instead of repeating (compared ignoring case and spacing).
 */

/** How many recent requests are kept. */
export const RECENT_REQUESTS_MAX = 5;
/** Longest request kept, in characters (code points); matches the request limit (tested). */
export const RECENT_REQUEST_MAX_LENGTH = 200;

/** Trims and collapses whitespace runs to one space. */
export function normalizeRequestText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function sameRequest(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function keepable(text: string): boolean {
  return text.length > 0 && [...text].length <= RECENT_REQUEST_MAX_LENGTH;
}

/** The list with `text` added at the top: normalized, earlier copies removed, at most 5. Unchanged for empty text. */
export function addRecentRequest(list: readonly string[], text: string): string[] {
  const entry = normalizeRequestText(text);
  if (!keepable(entry)) return [...list];
  return [entry, ...list.filter((old) => !sameRequest(old, entry))].slice(0, RECENT_REQUESTS_MAX);
}

/**
 * Reads a stored list leniently: anything that is not a JSON list of texts
 * gives an empty list; entries are normalized, empty, too long and repeated
 * ones dropped, at most 5 kept, order kept.
 */
export function parseRecentRequests(raw: string | null): string[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const list: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const text = normalizeRequestText(entry);
    if (!keepable(text) || list.some((old) => sameRequest(old, text))) continue;
    list.push(text);
    if (list.length >= RECENT_REQUESTS_MAX) break;
  }
  return list;
}
