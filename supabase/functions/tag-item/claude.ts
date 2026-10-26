/**
 * tag-item's model call: the shared Messages API call (`_shared/claude.ts`)
 * with this function's request body, reply reading and log line.
 *
 * Logs exactly one line per call: model, attempt, HTTP status (or
 * `network_error` / `timeout`), stop_reason, input and output tokens, latency,
 * and the names of invalid fields. Never the image, the key, the request or
 * the reply text, and never the provider's error message (it could echo input).
 */
import { callClaude, type CallInfo, type ProviderEnv, type ProviderError } from '../_shared/claude.ts';

import { readModelReply, type ModelReply } from './model-reply.ts';
import { buildTagRequestBody, TAG_MODEL } from './prompt.ts';

/** Tokens the provider reported for one call; null when the reply did not say. */
export interface CallTokens {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ProviderResult = { kind: 'reply'; reply: ModelReply; tokens: CallTokens } | { kind: 'error'; error: ProviderError };

interface LogFields extends CallInfo {
  attempt: number;
  outcome: string;
  problems?: string[];
}

function logCall(env: ProviderEnv, fields: LogFields): void {
  try {
    env.log(
      JSON.stringify({
        fn: 'tag-item',
        event: 'provider_call',
        model: TAG_MODEL,
        attempt: fields.attempt,
        status: fields.status,
        stop_reason: fields.stopReason,
        input_tokens: fields.inputTokens,
        output_tokens: fields.outputTokens,
        latency_ms: fields.latencyMs,
        outcome: fields.outcome,
        ...(fields.problems && fields.problems.length > 0 ? { problems: fields.problems } : {}),
      }),
    );
  } catch {
    // Logging must never break tagging.
  }
}

/**
 * Sends the photo to the model once. Resolves the reply (possibly malformed)
 * or a provider error. Never throws. The whole call, including reading the
 * reply, must finish within `timeoutMs`.
 */
export async function callTagModel(
  imageBase64: string,
  attempt: number,
  timeoutMs: number,
  env: ProviderEnv,
): Promise<ProviderResult> {
  const call = await callClaude(buildTagRequestBody(imageBase64), timeoutMs, env);
  if (call.kind === 'error') {
    logCall(env, { ...call.info, attempt, outcome: call.error });
    return { kind: 'error', error: call.error };
  }
  const reply = readModelReply(call.body);
  logCall(env, {
    ...call.info,
    attempt,
    outcome: reply.kind === 'malformed' ? `malformed:${reply.reason}` : reply.problems.length > 0 ? 'partial' : 'ok',
    problems: reply.kind === 'tags' ? reply.problems : undefined,
  });
  return { kind: 'reply', reply, tokens: { inputTokens: call.info.inputTokens, outputTokens: call.info.outputTokens } };
}
