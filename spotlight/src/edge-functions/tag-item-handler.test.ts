/**
 * Tests for the tag-item edge function's logic, which lives in plain
 * TypeScript under `supabase/functions/` (the Deno entry point is a thin
 * adapter). Kept here so the app's Jest and tsc cover them.
 */
import {
  drain,
  DRAIN_LIMIT_BYTES,
  DRAIN_TIME_MS,
  finishBody,
  handleTagItem,
  readCapped,
  type ByteReader,
  type CappedBody,
  type TagItemHttpRequest,
} from '../../../supabase/functions/tag-item/handler.ts';
import {
  STUB_TAG_ITEM_RESPONSE,
  TAG_ITEM_MAX_BODY_BYTES,
  validateTagItemResponse,
} from '../../../supabase/functions/_shared/tag-item-contract.ts';
import { CONNECTION_CHECK_IMAGE } from '@/ai/connection-check';

/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = 'ab'.repeat(32);
const VALID_BODY = JSON.stringify({ imageBase64: CONNECTION_CHECK_IMAGE.base64, contentType: 'image/jpeg' });

function request(overrides: Partial<TagItemHttpRequest> & { body?: string } = {}) {
  const { body = VALID_BODY, ...rest } = overrides;
  const readBody = jest.fn(async (maxBytes: number): Promise<CappedBody> =>
    new TextEncoder().encode(body).length > maxBytes ? { ok: false, reason: 'too_large' } : { ok: true, text: body },
  );
  const req: TagItemHttpRequest = {
    method: 'POST',
    authorization: `Bearer ${TOKEN}`,
    contentLength: null,
    readBody,
    ...rest,
  };
  return { req, readBody: req.readBody === readBody ? readBody : null };
}

const env = { devToken: TOKEN };

function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } }).error?.code;
}

describe('handleTagItem', () => {
  it('answers a valid, authorized request with the schema-valid stub', async () => {
    const { req } = request();
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(STUB_TAG_ITEM_RESPONSE);
    expect(validateTagItemResponse(JSON.parse(JSON.stringify(result.body))).ok).toBe(true);
    expect(result.headers['Content-Type']).toMatch(/^application\/json/);
    expect(result.headers['Cache-Control']).toBe('no-store');
  });

  it.each(['GET', 'PUT', 'OPTIONS', 'DELETE'])('rejects %s with 405 and Allow: POST, before checking the token', async (method) => {
    const { req, readBody } = request({ method, authorization: null });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(405);
    expect(result.headers.Allow).toBe('POST');
    expect(errorCode(result.body)).toBe('method_not_allowed');
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['not Bearer', `Basic ${TOKEN}`],
    ['wrong token', `Bearer ${'cd'.repeat(32)}`],
    ['a prefix of the token', `Bearer ${TOKEN.slice(0, 63)}`],
    ['the token plus more', `Bearer ${TOKEN}x`],
    ['Bearer without a token', 'Bearer '],
  ])('returns 401 for a %s Authorization header without reading the body', async (_name, authorization) => {
    const { req, readBody } = request({ authorization });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(401);
    expect(errorCode(result.body)).toBe('unauthorized');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(readBody).not.toHaveBeenCalled();
  });

  it('accepts the scheme in any case', async () => {
    const { req } = request({ authorization: `bearer ${TOKEN}` });
    expect((await handleTagItem(req, env)).status).toBe(200);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['too short', 'short-token'],
  ])('fails closed with 500 for a well-formed bearer token when DEV_TOKEN is %s', async (_name, devToken) => {
    const { req, readBody } = request();
    const result = await handleTagItem(req, { devToken });
    expect(result.status).toBe(500);
    expect(errorCode(result.body)).toBe('server_misconfigured');
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['Bearer without a token', 'Bearer '],
    ['not Bearer', `Basic ${TOKEN}`],
  ])('returns 401 (not 500) for a %s header even when DEV_TOKEN is unset', async (_name, authorization) => {
    const { req } = request({ authorization });
    for (const devToken of [undefined, '', 'short-token']) {
      const result = await handleTagItem(req, { devToken });
      expect(result.status).toBe(401);
      expect(errorCode(result.body)).toBe('unauthorized');
    }
  });

  it('returns 400 too_large from a Content-Length over the limit without reading the body', async () => {
    const { req, readBody } = request({ contentLength: String(TAG_ITEM_MAX_BODY_BYTES + 1) });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe('too_large');
    expect(readBody).not.toHaveBeenCalled();
  });

  it('returns 400 too_large when the body itself is over the limit (no or a false Content-Length)', async () => {
    const big = JSON.stringify({ imageBase64: `/9j/${'A'.repeat(TAG_ITEM_MAX_BODY_BYTES)}`, contentType: 'image/jpeg' });
    const { req, readBody } = request({ body: big, contentLength: '100' });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe('too_large');
    expect(readBody).toHaveBeenCalledWith(TAG_ITEM_MAX_BODY_BYTES);
  });

  it('returns 400 when the body cannot be read', async () => {
    const { req } = request();
    req.readBody = async () => ({ ok: false, reason: 'unreadable' });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe('bad_request');
  });

  it.each([
    ['not JSON', '{nope'],
    ['empty', ''],
    ['an array', '[]'],
    ['missing the image', JSON.stringify({ contentType: 'image/jpeg' })],
    ['a PNG', JSON.stringify({ imageBase64: 'iVBORw0KGgo=', contentType: 'image/jpeg' })],
    ['the wrong content type', JSON.stringify({ imageBase64: CONNECTION_CHECK_IMAGE.base64, contentType: 'image/png' })],
  ])('returns 400 bad_request for a body that is %s', async (_name, body) => {
    const { req } = request({ body });
    const result = await handleTagItem(req, env);
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe('bad_request');
  });
});

/** A reader over fixed chunks that records cancellation. */
function chunkReader(chunks: Uint8Array[], failAt = -1): ByteReader & { cancelled: boolean; reads: number } {
  const reader = {
    cancelled: false,
    reads: 0,
    async read() {
      const index = reader.reads++;
      if (index === failAt) throw new Error('connection reset');
      if (index >= chunks.length) return { done: true };
      return { done: false, value: chunks[index] };
    },
    async cancel() {
      reader.cancelled = true;
    },
  };
  return reader;
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe('readCapped', () => {
  it('joins chunks as UTF-8 (including characters split across chunks)', async () => {
    const all = bytes('{"a":"héllo"}');
    const reader = chunkReader([all.slice(0, 8), all.slice(8)]);
    expect(await readCapped(reader, 100)).toEqual({ ok: true, text: '{"a":"héllo"}' });
  });

  it('treats a missing body as empty', async () => {
    expect(await readCapped(null, 10)).toEqual({ ok: true, text: '' });
  });

  it('stops reading as soon as the total passes the limit', async () => {
    const reader = chunkReader([bytes('12345'), bytes('67890'), bytes('abc')]);
    expect(await readCapped(reader, 8)).toEqual({ ok: false, reason: 'too_large' });
    expect(reader.reads).toBe(2);
  });

  it('accepts a body of exactly the limit', async () => {
    expect(await readCapped(chunkReader([bytes('1234'), bytes('5678')]), 8)).toEqual({ ok: true, text: '12345678' });
  });

  it('reports a read error or invalid UTF-8 as unreadable', async () => {
    expect(await readCapped(chunkReader([bytes('12')], 1), 8)).toEqual({ ok: false, reason: 'unreadable' });
    expect(await readCapped(chunkReader([new Uint8Array([0xff, 0xfe])]), 8)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

const LIMITS = { bytes: 100, timeMs: 1000 };

describe('drain', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the rest of the body to the end without cancelling', async () => {
    const reader = chunkReader([bytes('abc'), bytes('def')]);
    expect(await drain(reader, LIMITS)).toBe('done');
    expect(reader.reads).toBe(3);
    expect(reader.cancelled).toBe(false);
  });

  it('cancels once more than the byte limit has been discarded', async () => {
    const reader = chunkReader([bytes('12345'), bytes('67890'), bytes('abc')]);
    expect(await drain(reader, { bytes: 6, timeMs: 1000 })).toBe('cancelled');
    expect(reader.reads).toBe(2);
    expect(reader.cancelled).toBe(true);
  });

  it('cancels a stalled or trickling upload when the time budget runs out', async () => {
    jest.useFakeTimers();
    let reads = 0;
    let cancelled = false;
    const stalled: ByteReader = {
      read: () => {
        reads++;
        // Two quick chunks, then nothing ever arrives.
        return reads <= 2 ? Promise.resolve({ done: false, value: bytes('x') }) : new Promise(() => {});
      },
      cancel: async () => {
        cancelled = true;
      },
    };
    const pending = drain(stalled, LIMITS);
    await jest.advanceTimersByTimeAsync(LIMITS.timeMs - 1);
    expect(cancelled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('cancelled');
    expect(cancelled).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer when the body ends in time', async () => {
    jest.useFakeTimers();
    await drain(chunkReader([bytes('a')]), LIMITS);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a missing body and read errors', async () => {
    await expect(drain(null)).resolves.toBe('done');
    await expect(drain(chunkReader([bytes('1')], 0), LIMITS)).resolves.toBe('done');
  });

  it('defaults to 8 MB and 5 seconds', () => {
    expect(DRAIN_LIMIT_BYTES).toBe(8_000_000);
    expect(DRAIN_TIME_MS).toBe(5_000);
  });
});

describe('finishBody', () => {
  it('cancels at once, without reading, when Content-Length is over the drain limit', async () => {
    const reader = chunkReader([bytes('abc')]);
    expect(await finishBody(reader, String(LIMITS.bytes + 1), LIMITS)).toBe('cancelled');
    expect(reader.reads).toBe(0);
    expect(reader.cancelled).toBe(true);
  });

  it.each([
    ['no Content-Length', null],
    ['a Content-Length within the limit', String(LIMITS.bytes)],
    ['a garbled Content-Length', 'lots'],
  ])('drains with %s', async (_name, contentLength) => {
    const reader = chunkReader([bytes('abc')]);
    expect(await finishBody(reader, contentLength, LIMITS)).toBe('done');
    expect(reader.reads).toBe(2);
    expect(reader.cancelled).toBe(false);
  });

  it('still bounds a body that lies about its length', async () => {
    const reader = chunkReader([bytes('x'.repeat(60)), bytes('x'.repeat(60)), bytes('x')]);
    expect(await finishBody(reader, '10', LIMITS)).toBe('cancelled');
    expect(reader.reads).toBe(2);
  });

  it('does nothing without a body', async () => {
    expect(await finishBody(null, '999999999', LIMITS)).toBe('done');
  });
});
