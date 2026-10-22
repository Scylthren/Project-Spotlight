/**
 * Fake Messages API answers for the tag-item function tests. No network.
 */
import type { ItemTags } from '../../../../supabase/functions/_shared/tag-item-contract.ts';

/** A fully valid reply, as the model would give it for a striped navy shirt. */
export const VALID_MODEL_TAGS: ItemTags = {
  category: 'top',
  colors: ['navy', 'white'],
  seasons: ['spring', 'summer'],
  type: 'Oxford shirt',
  pattern: 'striped',
  material: 'cotton',
  fit: 'regular',
  formality: 'smart-casual',
};

/** A Response-like object with a status and a JSON text body. */
export function fakeResponse(status: number, text: string): Response {
  return { status, text: async () => text, body: null } as unknown as Response;
}

/** A 200 Messages API answer whose first text block is `json` (an object, or raw text). */
export function modelReply(
  json: unknown,
  { stopReason = 'end_turn', inputTokens = 1234, outputTokens = 56 }: { stopReason?: string; inputTokens?: number; outputTokens?: number } = {},
): Response {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  return fakeResponse(
    200,
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  );
}
