/**
 * One call to the Claude Messages API with plain `fetch` (no SDK, so the code
 * stays testable in Jest with a fake `fetch`).
 *
 * Logs exactly one line per call: model, attempt, HTTP status (or
 * `network_error` / `timeout`), stop_reason, input and output tokens, latency,
 * and the names of invalid fields. Never the image, the key, the request or
 * the reply text, and never the provider's error message (it could echo input).
 */
import { readModelReply, type ModelReply } from './model-reply.ts';
import { buildTagRequestBody, TAG_MODEL } from './prompt.ts';

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

export type ProviderResult = { kind: 'reply'; reply: ModelReply } | { kind: 'error'; error: ProviderError };

/** How an HTTP status from the provider is reported (anything but 200). */
export function classifyProviderStatus(status: number): ProviderError {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable'; // includes 529 overloaded
  return 'rejected';
}

interface LogFields {
  attempt: number;
  status: number | 'network_error' | 'timeout';
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
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

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  const started = env.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  const latency = () => Math.max(0, Math.round(env.now() - started));

  const work = (async (): Promise<
    { kind: 'network' } | { kind: 'status'; status: number } | { kind: 'body'; status: 200; body: unknown }
  > => {
    let response: Response;
    try {
      response = await env.fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'x-api-key': env.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildTagRequestBody(imageBase64)),
        signal: controller.signal,
      });
    } catch {
      return { kind: 'network' };
    }
    if (response.status !== 200) {
      // The error body is not needed (and may echo input); free the connection.
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
      return { kind: 'body', status: 200, body: JSON.parse(text) };
    } catch {
      return { kind: 'body', status: 200, body: null };
    }
  })();

  try {
    const result = await Promise.race([work, expired]);
    if (result === 'timeout') {
      work.catch(() => undefined);
      logCall(env, { attempt, status: 'timeout', stopReason: null, inputTokens: null, outputTokens: null, latencyMs: latency(), outcome: 'timeout' });
      return { kind: 'error', error: 'timeout' };
    }
    if (result.kind === 'network') {
      logCall(env, { attempt, status: 'network_error', stopReason: null, inputTokens: null, outputTokens: null, latencyMs: latency(), outcome: 'unavailable' });
      return { kind: 'error', error: 'unavailable' };
    }
    if (result.kind === 'status') {
      const error = classifyProviderStatus(result.status);
      logCall(env, { attempt, status: result.status, stopReason: null, inputTokens: null, outputTokens: null, latencyMs: latency(), outcome: error });
      return { kind: 'error', error };
    }
    const body = result.body as { stop_reason?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
    const reply = readModelReply(body);
    logCall(env, {
      attempt,
      status: 200,
      stopReason: typeof body?.stop_reason === 'string' ? body.stop_reason : null,
      inputTokens: numberOrNull(body?.usage?.input_tokens),
      outputTokens: numberOrNull(body?.usage?.output_tokens),
      latencyMs: latency(),
      outcome: reply.kind === 'malformed' ? `malformed:${reply.reason}` : reply.problems.length > 0 ? 'partial' : 'ok',
      problems: reply.kind === 'tags' ? reply.problems : undefined,
    });
    return { kind: 'reply', reply };
  } finally {
    clearTimeout(timer);
  }
}
