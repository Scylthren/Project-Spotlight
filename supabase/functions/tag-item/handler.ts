/**
 * tag-item request handling, independent of Deno so Jest can test it.
 * `index.ts` adapts a `Request` to `TagItemHttpRequest` and back.
 *
 * Order of checks: method (405), token (401), body size and shape (400).
 * The handler does not parse the body before the token check, but the
 * adapter still reads and discards an unread body before replying
 * (`finishBody`): answering mid-upload hangs the connection on the hosted
 * runtime. So any caller, authorized or not, can make the function read up
 * to DRAIN_LIMIT_BYTES (8 MB) or for DRAIN_TIME_MS (5 s), whichever comes
 * first; a declared Content-Length over the limit is cancelled at once.
 * Nothing here logs the token or the image.
 */
import { checkDevToken } from '../_shared/dev-token.ts';
import {
  STUB_TAG_ITEM_RESPONSE,
  TAG_ITEM_MAX_BODY_BYTES,
  validateTagItemRequest,
  type TagItemErrorCode,
  type TagItemErrorResponse,
  type TagItemResponse,
} from '../_shared/tag-item-contract.ts';

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
}

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

  // Gate 2 slice 1: a fixed answer. Slice 3 sends the image to the model here.
  return { status: 200, headers: { ...JSON_HEADERS }, body: STUB_TAG_ITEM_RESPONSE };
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
