/**
 * tag-item request handling, independent of Deno so Jest can test it.
 * `index.ts` adapts a `Request` to `TagItemHttpRequest` and back.
 *
 * Order of checks: method (405), token (401), API key configured (500),
 * body size and shape (400); then the photo goes to the model (`claude.ts`,
 * prompt in `prompt.ts`, reply checks in `model-reply.ts`).
 * The handler does not parse the body before the token check, but the
 * adapter still reads and discards an unread body before replying
 * (`finishBody`): answering mid-upload hangs the connection on the hosted
 * runtime. So any caller, authorized or not, can make the function read up
 * to DRAIN_LIMIT_BYTES (8 MB) or for DRAIN_TIME_MS (5 s), whichever comes
 * first; a declared Content-Length over the limit is cancelled at once.
 * Nothing here logs the token, the key, the image or the model's reply text.
 */
import { checkDevToken } from '../_shared/dev-token.ts';
import {
  TAG_ITEM_API_VERSION,
  TAG_ITEM_MAX_BODY_BYTES,
  validateTagItemRequest,
  type ItemTags,
  type TagItemErrorCode,
  type TagItemErrorResponse,
  type TagItemResponse,
  type TagItemUsage,
} from '../_shared/tag-item-contract.ts';

import { callTagModel, type ProviderEnv, type ProviderError } from './claude.ts';
import { EMPTY_TAGS, type ReadTags } from './model-reply.ts';
import { TAG_MODEL } from './prompt.ts';

export type CappedBody = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' };

export interface TagItemHttpRequest {
  method: string;
  authorization: string | null;
  contentLength: string | null;
  /** Reads the body as UTF-8, giving up once it exceeds `maxBytes`. */
  readBody(maxBytes: number): Promise<CappedBody>;
}

export interface TagItemHttpResult {
  status: number;
  headers: Record<string, string>;
  body: TagItemResponse | TagItemErrorResponse;
}

export interface TagItemEnv {
  /** The `DEV_TOKEN` secret. */
  devToken: string | undefined;
  /** The `ANTHROPIC_API_KEY` secret. Missing or empty: 500 `server_misconfigured` (no stub fallback). */
  anthropicApiKey: string | undefined;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** One line per provider call; defaults to `console.log`. */
  log?: (line: string) => void;
  /** Per-call timeout; defaults to `PROVIDER_ATTEMPT_TIMEOUT_MS`. */
  attemptTimeoutMs?: number;
  /** Time for all calls together; defaults to `PROVIDER_BUDGET_MS`. */
  budgetMs?: number;
}

/**
 * Time limits for the model calls. The app gives up after 20 s, which also
 * covers the upload, so the function stays well inside that: each call at
 * most 8 s, all calls together at most 16 s, and the one retry only starts
 * with at least 3 s of the budget left.
 */
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 8_000;
export const PROVIDER_BUDGET_MS = 16_000;
export const PROVIDER_MIN_RETRY_MS = 3_000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function failure(
  status: number,
  code: TagItemErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
): TagItemHttpResult {
  return { status, headers: { ...JSON_HEADERS, ...extraHeaders }, body: { error: { code, message } } };
}

export async function handleTagItem(request: TagItemHttpRequest, env: TagItemEnv): Promise<TagItemHttpResult> {
  if (request.method !== 'POST') {
    return failure(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });
  }

  const auth = checkDevToken(request.authorization, env.devToken);
  if (auth === 'misconfigured') return failure(500, 'server_misconfigured', 'The function is not configured.');
  if (auth === 'unauthorized') return failure(401, 'unauthorized', 'Missing or wrong token.');
  const apiKey = env.anthropicApiKey?.trim();
  if (!apiKey) return failure(500, 'server_misconfigured', 'The function is not configured.');

  const declared = request.contentLength === null ? null : Number(request.contentLength);
  if (declared !== null && Number.isFinite(declared) && declared > TAG_ITEM_MAX_BODY_BYTES) {
    return failure(400, 'too_large', `The body is larger than ${TAG_ITEM_MAX_BODY_BYTES} bytes.`);
  }
  const body = await request.readBody(TAG_ITEM_MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === 'too_large'
      ? failure(400, 'too_large', `The body is larger than ${TAG_ITEM_MAX_BODY_BYTES} bytes.`)
      : failure(400, 'bad_request', 'The body could not be read.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, 'bad_request', 'The body is not valid JSON.');
  }
  const valid = validateTagItemRequest(parsed);
  if (!valid.ok) return failure(400, 'bad_request', valid.reason);

  const outcome = await tagWithModel(valid.value.imageBase64, {
    apiKey,
    fetch: env.fetch ?? ((input, init) => fetch(input, init)),
    now: env.now ?? (() => Date.now()),
    log: env.log ?? ((line) => console.log(line)),
    attemptTimeoutMs: env.attemptTimeoutMs ?? PROVIDER_ATTEMPT_TIMEOUT_MS,
    budgetMs: env.budgetMs ?? PROVIDER_BUDGET_MS,
  });
  if (outcome.kind === 'error') return PROVIDER_FAILURES[outcome.error];
  const response: TagItemResponse = { apiVersion: TAG_ITEM_API_VERSION, tags: outcome.tags, stub: false, usage: outcome.usage };
  return { status: 200, headers: { ...JSON_HEADERS }, body: response };
}

/** Fixed answers for provider trouble; the provider's own message is never passed on. */
const PROVIDER_FAILURES: Record<ProviderError, TagItemHttpResult> = {
  unavailable: failure(503, 'upstream_unavailable', 'The tagging service is unavailable. Try again later.'),
  rate_limited: failure(503, 'upstream_rate_limited', 'The tagging service is busy. Try again later.'),
  timeout: failure(504, 'upstream_timeout', 'The tagging service did not answer in time.'),
  rejected: failure(502, 'upstream_rejected', 'The tagging service refused the request.'),
};

interface TagWithModelOptions extends ProviderEnv {
  attemptTimeoutMs: number;
  budgetMs: number;
}

/**
 * Asks the model for tags (ROADMAP "Gate 2 slice 3 tagging rules").
 *
 * - A reply that is malformed (refusal, max_tokens, not JSON) or has any
 *   missing or out-of-list field is retried once, if at least
 *   PROVIDER_MIN_RETRY_MS of the budget is left.
 * - Then the answer is the valid part of the best reply (fewest problems;
 *   the later one on a tie), with invalid fields null or []. If no reply was
 *   readable at all, every field is empty: "no suggestion".
 * - A provider error (429, 5xx, 529, network, timeout, other 4xx) is not
 *   retried: it answers with the matching error, unless an earlier attempt
 *   already gave usable tags.
 * - `usage` sums the tokens of every call made for this answer (a call that
 *   reported no tokens counts 0) and counts the calls, failed ones included.
 */
export async function tagWithModel(
  imageBase64: string,
  options: TagWithModelOptions,
): Promise<{ kind: 'tags'; tags: ItemTags; usage: TagItemUsage } | { kind: 'error'; error: ProviderError }> {
  const deadline = options.now() + options.budgetMs;
  const usage: TagItemUsage = { model: TAG_MODEL, attempts: 0, inputTokens: 0, outputTokens: 0 };
  let best: ReadTags | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - options.now();
    if (attempt > 1 && remaining < PROVIDER_MIN_RETRY_MS) break;
    const result = await callTagModel(imageBase64, attempt, Math.min(options.attemptTimeoutMs, remaining), options);
    usage.attempts = attempt;
    if (result.kind === 'error') {
      if (best) break;
      return result;
    }
    const { reply, tokens } = result;
    usage.inputTokens += tokens.inputTokens ?? 0;
    usage.outputTokens += tokens.outputTokens ?? 0;
    if (reply.kind === 'malformed') continue;
    if (!best || reply.problems.length <= best.problems.length) best = reply;
    if (reply.problems.length === 0) break;
  }
  return { kind: 'tags', tags: best ? best.tags : { ...EMPTY_TAGS, colors: [], seasons: [] }, usage };
}

/** The part of `ReadableStreamDefaultReader` that `readCapped` uses. */
export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

/**
 * Reads a byte stream as UTF-8, stopping past `maxBytes`. Leaves the rest of
 * the stream unread; `finishBody` discards it before the response is sent.
 */
export async function readCapped(reader: ByteReader | null, maxBytes: number): Promise<CappedBody> {
  if (!reader) return { ok: true, text: '' };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) return { ok: false, reason: 'too_large' };
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * Bounds on discarding an unread request body before replying. Answering
 * while the client is still uploading left the connection hanging on the
 * hosted runtime (the gateway gave 503 after a minute), so the rest of the
 * body is read and dropped first, but never more than this many bytes or
 * for longer than this.
 */
export const DRAIN_LIMIT_BYTES = 8_000_000;
export const DRAIN_TIME_MS = 5_000;

export interface DrainLimits {
  bytes: number;
  timeMs: number;
}

const DEFAULT_DRAIN: DrainLimits = { bytes: DRAIN_LIMIT_BYTES, timeMs: DRAIN_TIME_MS };

/**
 * Reads and discards what is left of a request body. Cancels the stream once
 * more than `limits.bytes` were discarded or `limits.timeMs` passed (a slow
 * or stalled upload). Never throws.
 */
export async function drain(reader: ByteReader | null, limits: DrainLimits = DEFAULT_DRAIN): Promise<'done' | 'cancelled'> {
  if (!reader) return 'done';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(() => resolve('expired'), limits.timeMs);
  });
  let total = 0;
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), expired]);
      if (next === 'expired') break;
      if (next.done) return 'done';
      total += next.value?.length ?? 0;
      if (total > limits.bytes) break;
    }
  } catch {
    return 'done';
  } finally {
    clearTimeout(timer);
  }
  await reader.cancel().catch(() => undefined);
  return 'cancelled';
}

/**
 * What the adapter does with the request body before replying: cancel at
 * once when the declared Content-Length is already over the drain limit,
 * otherwise drain within the limits.
 */
export async function finishBody(
  reader: ByteReader | null,
  contentLength: string | null,
  limits: DrainLimits = DEFAULT_DRAIN,
): Promise<'done' | 'cancelled'> {
  if (!reader) return 'done';
  const declared = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared > limits.bytes) {
    await reader.cancel().catch(() => undefined);
    return 'cancelled';
  }
  return drain(reader, limits);
}
