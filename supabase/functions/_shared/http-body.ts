/**
 * Request body helpers shared by the edge functions, independent of Deno so
 * Jest can test them: read a body up to a byte limit, and discard what is
 * left of it (within bounds) before replying.
 *
 * Answering while the client is still uploading left the connection hanging
 * on the hosted runtime, so every adapter calls `finishBody` before it
 * returns a response. Any caller, authorized or not, can therefore make a
 * function read up to DRAIN_LIMIT_BYTES (8 MB) or for DRAIN_TIME_MS (5 s),
 * whichever comes first.
 */

export type CappedBody = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' };

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
