/**
 * Reads the model's reply (a Messages API response body) into candidate
 * outfits for `validateOutfits`.
 *
 * - `stop_reason` is checked first: `refusal`, `max_tokens` and anything but
 *   `end_turn` / `stop_sequence` count as malformed.
 * - The first `text` block must be a JSON object with a `looks` list.
 * - Each look's refs are mapped back to the real item ids. A ref that is not
 *   in the prompt becomes "" (never an item id), so the look fails as
 *   `unknown_id`; a real id the model was never shown counts as unknown too.
 * - Looks are passed on as they are otherwise: the composition rules,
 *   repeats and lengths are `outfit-rules.ts`'s job.
 *
 * Never returns or logs the reply text.
 */

export type OutfitModelReply =
  | { kind: 'looks'; candidates: unknown[] }
  | { kind: 'malformed'; reason: 'refusal' | 'max_tokens' | 'stop_reason' | 'no_text' | 'not_json' | 'not_object' | 'no_looks' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One look from the reply as `{ itemIds, rationale }` with real ids, or the value unchanged when it is not an object. */
function toCandidate(look: unknown, refs: ReadonlyMap<string, string>): unknown {
  if (!isRecord(look)) return look;
  const { items, rationale } = look;
  return {
    itemIds: Array.isArray(items) ? items.map((ref) => (typeof ref === 'string' ? (refs.get(ref) ?? '') : '')) : items,
    rationale,
  };
}

/** Reads a Messages API response body (already parsed from JSON). */
export function readOutfitReply(body: unknown, refs: ReadonlyMap<string, string>): OutfitModelReply {
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
  if (!Array.isArray(parsed.looks)) return { kind: 'malformed', reason: 'no_looks' };
  return { kind: 'looks', candidates: parsed.looks.map((look) => toCandidate(look, refs)) };
}
