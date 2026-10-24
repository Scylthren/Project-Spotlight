/**
 * One call to the Claude Messages API with plain `fetch` (no SDK, so the
 * code stays testable in Jest with a fake `fetch`). Same rules as tag-item's
 * `claude.ts`: the whole call, reading the reply included, must finish
 * within its timeout; a non-200 answer's body is discarded unread (it could
 * echo input); never throws.
 *
 * This module does not log: the handler writes one line per call once it
 * has checked the reply (`logOutfitCall`), so the line can carry the
 * validation counts too.
 */
import { buildOutfitRequestBody, OUTFIT_MODEL } from './prompt.ts';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export interface ProviderEnv {
  apiKey: string;
  fetch: typeof fetch;
  /** Milliseconds; `Date.now` in production. */
  now(): number;
  log(line: string): void;
}

export type ProviderError = 'unavailable' | 'rate_limited' | 'timeout' | 'rejected';

/** How an HTTP status from the provider is reported (anything but 200). */
export function classifyProviderStatus(status: number): ProviderError {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable'; // includes 529 overloaded
  return 'rejected';
}

export interface CallInfo {
  status: number | 'network_error' | 'timeout';
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export type CallResult = ({ kind: 'body'; body: unknown } | { kind: 'error'; error: ProviderError }) & { info: CallInfo };

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Sends the prompt once. Resolves the parsed body (null when it was not JSON) or a provider error. */
export async function callOutfitModel(promptText: string, timeoutMs: number, env: ProviderEnv): Promise<CallResult> {
  const started = env.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, Math.max(0, timeoutMs));
  });
  const latency = () => Math.max(0, Math.round(env.now() - started));
  const noReply = (status: CallInfo['status']): CallInfo => ({
    status,
    stopReason: null,
    inputTokens: null,
    outputTokens: null,
    latencyMs: latency(),
  });

  const work = (async (): Promise<{ kind: 'network' } | { kind: 'status'; status: number } | { kind: 'body'; body: unknown }> => {
    let response: Response;
    try {
      response = await env.fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'x-api-key': env.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildOutfitRequestBody(promptText)),
        signal: controller.signal,
      });
    } catch {
      return { kind: 'network' };
    }
    if (response.status !== 200) {
      try {
        await response.body?.cancel();
      } catch {
        // Already closed.
      }
      return { kind: 'status', status: response.status };
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      return { kind: 'network' };
    }
    try {
      return { kind: 'body', body: JSON.parse(text) };
    } catch {
      return { kind: 'body', body: null };
    }
  })();

  try {
    const result = await Promise.race([work, expired]);
    if (result === 'timeout') {
      work.catch(() => undefined);
      return { kind: 'error', error: 'timeout', info: noReply('timeout') };
    }
    if (result.kind === 'network') return { kind: 'error', error: 'unavailable', info: noReply('network_error') };
    if (result.kind === 'status') {
      return { kind: 'error', error: classifyProviderStatus(result.status), info: noReply(result.status) };
    }
    const body = result.body as { stop_reason?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
    return {
      kind: 'body',
      body: result.body,
      info: {
        status: 200,
        stopReason: typeof body?.stop_reason === 'string' ? body.stop_reason : null,
        inputTokens: numberOrNull(body?.usage?.input_tokens),
        outputTokens: numberOrNull(body?.usage?.output_tokens),
        latencyMs: latency(),
      },
    };
  } finally {
    clearTimeout(timer);
  }
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
