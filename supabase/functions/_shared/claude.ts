/**
 * One call to the Claude Messages API with plain `fetch` (no SDK, so the code
 * stays testable in Jest with a fake `fetch`). Shared by tag-item and
 * generate-outfits; each builds its own request body, reads its own reply
 * and writes its own log line.
 *
 * Rules: the whole call, reading the reply included, must finish within its
 * timeout (the request is aborted, and the call resolves `timeout` even if
 * `fetch` ignores the abort); a non-200 answer's body is discarded unread
 * (it could echo input); never throws; never logs (callers log counts only).
 */

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

/** What one call did, for the caller's log line. Tokens are null when the reply did not say. */
export interface CallInfo {
  status: number | 'network_error' | 'timeout';
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

/** The parsed 200 body (null when it was not JSON), or a provider error; with the call's info either way. */
export type CallResult = ({ kind: 'body'; body: unknown } | { kind: 'error'; error: ProviderError }) & { info: CallInfo };

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Posts `requestBody` (JSON-encoded) to the Messages API once. Resolves the
 * parsed body or a provider error: a network failure or a dropped reply is
 * `unavailable`, running past `timeoutMs` is `timeout`, and other statuses
 * follow `classifyProviderStatus`.
 */
export async function callClaude(requestBody: unknown, timeoutMs: number, env: ProviderEnv): Promise<CallResult> {
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
        body: JSON.stringify(requestBody),
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
