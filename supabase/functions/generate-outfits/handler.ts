/**
 * generate-outfits request handling, independent of Deno so Jest can test
 * it. `index.ts` adapts a `Request` to `GenerateOutfitsHttpRequest` and back.
 * API: `docs/api/generate-outfits.md`.
 *
 * Order of checks, as in tag-item: method (405), token (401; 500 when the
 * secret is unusable), rate limit (429, `_shared/rate-limit.ts`), model
 * key (500), body size, JSON and shape (400), then whether the closet can form any outfit (422 `not_enough_items`,
 * before any model call). Then (Gate 3 slice 3) the closet is trimmed for
 * the prompt (`prefilter.ts`), the model is asked for looks (`prompt.ts`,
 * `claude.ts`, `model-reply.ts`), and every look is checked by the
 * composition rules (`outfit-rules.ts`); one retry when no valid look
 * survives and the time budget allows.
 *
 * The adapter drains an unread body before replying (`finishBody` in
 * `_shared/http-body.ts`). Nothing here logs the token, the key, the
 * request text, the closet, ids or the model's reply: one line per model
 * call and one per answer, counts only.
 */
import type { ProviderEnv, ProviderError } from '../_shared/claude.ts';
import { checkDevToken } from '../_shared/dev-token.ts';
import {
  GENERATE_OUTFITS_API_VERSION,
  GENERATE_OUTFITS_MAX_BODY_BYTES,
  missingForOutfit,
  validateGenerateOutfitsRequest,
  type GeneratedOutfit,
  type GenerateOutfitsErrorCode,
  type GenerateOutfitsErrorResponse,
  type GenerateOutfitsResponse,
  type GenerateOutfitsUsage,
  type OutfitBasePiece,
  type ValidGenerateOutfitsRequest,
} from '../_shared/generate-outfits-contract.ts';
import type { CappedBody } from '../_shared/http-body.ts';
import type { FixedWindowRateLimiter, RateLimit } from '../_shared/rate-limit.ts';

import { callOutfitModel, logOutfitCall } from './claude.ts';
import { readOutfitReply } from './model-reply.ts';
import { indexCloset, validateOutfits, type OutfitValidation } from './outfit-rules.ts';
import { prefilterCloset } from './prefilter.ts';
import { buildOutfitPrompt, OUTFIT_MODEL } from './prompt.ts';

export interface GenerateOutfitsHttpRequest {
  method: string;
  authorization: string | null;
  contentLength: string | null;
  /** Reads the body as UTF-8, giving up once it exceeds `maxBytes`. */
  readBody(maxBytes: number): Promise<CappedBody>;
}

export interface GenerateOutfitsHttpResult {
  status: number;
  headers: Record<string, string>;
  body: GenerateOutfitsResponse | GenerateOutfitsErrorResponse;
}

export interface GenerateOutfitsEnv {
  /** The `DEV_TOKEN` secret. */
  devToken: string | undefined;
  /** The `ANTHROPIC_API_KEY` secret. Missing or empty: 500 `server_misconfigured` (no stub fallback). */
  anthropicApiKey: string | undefined;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** One line per model call and one per answer; defaults to `console.log`. */
  log?: (line: string) => void;
  /** Per-call timeout; defaults to `PROVIDER_ATTEMPT_TIMEOUT_MS`. */
  attemptTimeoutMs?: number;
  /** Time for all calls together; defaults to `PROVIDER_BUDGET_MS`. */
  budgetMs?: number;
  /**
   * Counts requests that pass the token check. `index.ts` passes one per
   * instance (`GENERATE_OUTFITS_RATE_LIMIT`); none means no limit (tests).
   */
  rateLimiter?: FixedWindowRateLimiter;
}

/**
 * Best-effort limit per function instance (`_shared/rate-limit.ts`): 20
 * requests a minute is a Restyle every 3 seconds, far above one person's
 * use, and caps a runaway loop at under $0.01 a minute per instance (the platform can run several).
 */
export const GENERATE_OUTFITS_RATE_LIMIT: RateLimit = { limit: 20, windowMs: 60_000 };

/**
 * Time limits for the model calls (Gate 3 decision D4). The app gives up
 * after 30 s, which also covers the upload, so the function keeps all its
 * calls within 25 s: each call at most 15 s, and the one retry only starts
 * with at least 5 s of the budget left (and gets only what is left).
 */
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 15_000;
export const PROVIDER_BUDGET_MS = 25_000;
export const PROVIDER_MIN_RETRY_MS = 5_000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function failure(
  status: number,
  code: GenerateOutfitsErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
  missing?: OutfitBasePiece[],
): GenerateOutfitsHttpResult {
  const error = missing ? { code, message, missing } : { code, message };
  return { status, headers: { ...JSON_HEADERS, ...extraHeaders }, body: { error } };
}

/** What to add, in words, for the not_enough_items message. */
export function notEnoughItemsMessage(missing: readonly OutfitBasePiece[]): string {
  const needsTop = missing.includes('top');
  const needsBottom = missing.includes('bottom');
  const pair = needsTop && needsBottom ? 'a top and a bottom' : needsTop ? 'a top' : 'a bottom';
  return `The closet cannot form an outfit: add ${pair}, or a dress.`;
}

export async function handleGenerateOutfits(
  request: GenerateOutfitsHttpRequest,
  env: GenerateOutfitsEnv,
): Promise<GenerateOutfitsHttpResult> {
  if (request.method !== 'POST') {
    return failure(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });
  }

  const auth = checkDevToken(request.authorization, env.devToken);
  if (auth === 'misconfigured') return failure(500, 'server_misconfigured', 'The function is not configured.');
  if (auth === 'unauthorized') return failure(401, 'unauthorized', 'Missing or wrong token.');
  const rate = env.rateLimiter?.take((env.now ?? Date.now)());
  if (rate && !rate.ok) {
    return failure(429, 'rate_limited', 'Too many requests. Try again in a minute.', { 'Retry-After': String(rate.retryAfterSeconds) });
  }
  const apiKey = env.anthropicApiKey?.trim();
  if (!apiKey) return failure(500, 'server_misconfigured', 'The function is not configured.');

  const tooLarge = `The body is larger than ${GENERATE_OUTFITS_MAX_BODY_BYTES} bytes.`;
  const declared = request.contentLength === null ? null : Number(request.contentLength);
  if (declared !== null && Number.isFinite(declared) && declared > GENERATE_OUTFITS_MAX_BODY_BYTES) {
    return failure(400, 'too_large', tooLarge);
  }
  const body = await request.readBody(GENERATE_OUTFITS_MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === 'too_large' ? failure(400, 'too_large', tooLarge) : failure(400, 'bad_request', 'The body could not be read.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, 'bad_request', 'The body is not valid JSON.');
  }
  const valid = validateGenerateOutfitsRequest(parsed);
  if (!valid.ok) return failure(400, 'bad_request', valid.reason);
  const missing = missingForOutfit(valid.value.items);
  if (missing.length > 0) return failure(422, 'not_enough_items', notEnoughItemsMessage(missing), {}, missing);

  const log = env.log ?? ((line) => console.log(line));
  const outcome = await generateWithModel(valid.value, {
    apiKey,
    fetch: env.fetch ?? ((input, init) => fetch(input, init)),
    now: env.now ?? (() => Date.now()),
    log,
    attemptTimeoutMs: env.attemptTimeoutMs ?? PROVIDER_ATTEMPT_TIMEOUT_MS,
    budgetMs: env.budgetMs ?? PROVIDER_BUDGET_MS,
  });
  try {
    log(
      JSON.stringify({
        fn: 'generate-outfits',
        event: 'answer',
        mode: valid.value.mode,
        items: valid.value.items.length,
        prompt_items: valid.value.items.length - outcome.omittedItems,
        omitted: outcome.omittedItems,
        avoid: valid.value.avoid?.length ?? 0,
        attempts: outcome.usage.attempts,
        ...(outcome.kind === 'error' ? { error: outcome.error } : { outfits: outcome.outfits.length }),
      }),
    );
  } catch {
    // Logging must never break the answer.
  }
  if (outcome.kind === 'error') return PROVIDER_FAILURES[outcome.error];
  const response: GenerateOutfitsResponse = {
    apiVersion: GENERATE_OUTFITS_API_VERSION,
    outfits: outcome.outfits,
    stub: false,
    usage: outcome.usage,
    omittedItems: outcome.omittedItems,
  };
  return { status: 200, headers: { ...JSON_HEADERS }, body: response };
}

/** Fixed answers for provider trouble; the provider's own message is never passed on. */
const PROVIDER_FAILURES: Record<ProviderError, GenerateOutfitsHttpResult> = {
  unavailable: failure(503, 'upstream_unavailable', 'The outfit service is unavailable. Try again later.'),
  rate_limited: failure(503, 'upstream_rate_limited', 'The outfit service is busy. Try again later.'),
  timeout: failure(504, 'upstream_timeout', 'The outfit service did not answer in time.'),
  rejected: failure(502, 'upstream_rejected', 'The outfit service refused the request.'),
};

interface GenerateWithModelOptions extends ProviderEnv {
  attemptTimeoutMs: number;
  budgetMs: number;
}

export type GenerateOutcome = (
  | { kind: 'outfits'; outfits: GeneratedOutfit[] }
  | { kind: 'error'; error: ProviderError }
) & { usage: GenerateOutfitsUsage; omittedItems: number };

/**
 * Asks the model for looks and keeps the valid ones.
 *
 * - The closet is trimmed for the prompt (`prefilterCloset`); looks are
 *   checked against what the model was shown.
 * - A reply that is malformed (refusal, max_tokens, not JSON, no `looks`)
 *   or has no valid look left after the checks is retried once, if at least
 *   PROVIDER_MIN_RETRY_MS of the budget is left. The answer is the reply
 *   with the most valid looks (the first on a tie); 0 looks is a valid
 *   answer when the model replied but nothing passed.
 * - A provider error (429, 5xx, 529, network, timeout, other 4xx) is not
 *   retried. It is the answer unless an earlier attempt gave a readable
 *   reply (then that reply's looks, possibly none).
 * - `usage` sums the tokens of every call (a call that reported none
 *   counts 0) and counts the calls, failed ones included.
 */
export async function generateWithModel(request: ValidGenerateOutfitsRequest, options: GenerateWithModelOptions): Promise<GenerateOutcome> {
  const deadline = options.now() + options.budgetMs;
  const usage: GenerateOutfitsUsage = { model: OUTFIT_MODEL, attempts: 0, inputTokens: 0, outputTokens: 0 };
  const avoid = request.avoid ?? [];
  const trimmed = prefilterCloset(request.items, request.request, request.weather);
  const prompt = buildOutfitPrompt({ request: request.request, mode: request.mode, weather: request.weather, items: trimmed.items, avoid });
  const closet = indexCloset(trimmed.items);
  const base = { usage, omittedItems: trimmed.omitted };
  let best: OutfitValidation | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - options.now();
    if (attempt > 1 && remaining < PROVIDER_MIN_RETRY_MS) break;
    const call = await callOutfitModel(prompt.text, Math.min(options.attemptTimeoutMs, remaining), options);
    usage.attempts = attempt;
    usage.inputTokens += call.info.inputTokens ?? 0;
    usage.outputTokens += call.info.outputTokens ?? 0;
    const logged = { ...call.info, attempt, promptItems: trimmed.items.length };
    if (call.kind === 'error') {
      logOutfitCall(options, { ...logged, outcome: call.error });
      if (best) break;
      return { kind: 'error', error: call.error, ...base };
    }
    const reply = readOutfitReply(call.body, prompt.refs);
    if (reply.kind === 'malformed') {
      logOutfitCall(options, { ...logged, outcome: `malformed:${reply.reason}` });
      continue;
    }
    const checked = validateOutfits(reply.candidates, closet, avoid);
    logOutfitCall(options, {
      ...logged,
      outcome: checked.outfits.length > 0 ? 'ok' : 'no_valid_looks',
      looks: reply.candidates.length,
      valid: checked.outfits.length,
      duplicates: checked.duplicates,
      avoided: checked.avoided,
      problems: [...new Set(checked.rejected.flatMap((entry) => entry.problems))],
    });
    if (!best || checked.outfits.length > best.outfits.length) best = checked;
    if (checked.outfits.length > 0) break;
  }
  return { kind: 'outfits', outfits: best ? best.outfits : [], ...base };
}
