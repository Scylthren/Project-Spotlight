/**
 * generate-outfits' model call: the shared Messages API call
 * (`_shared/claude.ts`) with this function's request body, and its log line.
 *
 * `callOutfitModel` does not log: the handler writes one line per call once
 * it has checked the reply (`logOutfitCall`), so the line can carry the
 * validation counts too.
 */
import { callClaude, type CallInfo, type CallResult, type ProviderEnv } from '../_shared/claude.ts';

import { buildOutfitRequestBody, OUTFIT_MODEL } from './prompt.ts';

/** Sends the prompt once. Resolves the parsed body (null when it was not JSON) or a provider error. */
export function callOutfitModel(promptText: string, timeoutMs: number, env: ProviderEnv): Promise<CallResult> {
  return callClaude(buildOutfitRequestBody(promptText), timeoutMs, env);
}

export interface OutfitCallLog extends CallInfo {
  attempt: number;
  /** `ok`, `malformed:<reason>`, `no_valid_looks`, or a provider error. */
  outcome: string;
  /** Items that reached the prompt. */
  promptItems: number;
  /** Looks in the reply, valid ones kept, and the problem names of the rest (counts and names only). */
  looks?: number;
  valid?: number;
  duplicates?: number;
  avoided?: number;
  problems?: string[];
}

/** One JSON line per model call. Never the key, request text, closet, ids or reply. */
export function logOutfitCall(env: Pick<ProviderEnv, 'log'>, fields: OutfitCallLog): void {
  try {
    env.log(
      JSON.stringify({
        fn: 'generate-outfits',
        event: 'provider_call',
        model: OUTFIT_MODEL,
        attempt: fields.attempt,
        status: fields.status,
        stop_reason: fields.stopReason,
        input_tokens: fields.inputTokens,
        output_tokens: fields.outputTokens,
        latency_ms: fields.latencyMs,
        prompt_items: fields.promptItems,
        outcome: fields.outcome,
        ...(fields.looks !== undefined ? { looks: fields.looks, valid: fields.valid, duplicates: fields.duplicates, avoided: fields.avoided } : {}),
        ...(fields.problems && fields.problems.length > 0 ? { problems: fields.problems } : {}),
      }),
    );
  } catch {
    // Logging must never break the answer.
  }
}
