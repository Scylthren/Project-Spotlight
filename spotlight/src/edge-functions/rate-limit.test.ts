/**
 * The best-effort in-memory limiter (`supabase/functions/_shared/rate-limit.ts`)
 * and how both functions use it: after the token check, before the key and
 * the body, answering 429 `rate_limited` with Retry-After.
 */
import { FixedWindowRateLimiter } from '../../../supabase/functions/_shared/rate-limit.ts';
import { tagItemErrorCode } from '../../../supabase/functions/_shared/tag-item-contract.ts';
import { readGenerateOutfitsError } from '../../../supabase/functions/_shared/generate-outfits-contract.ts';
import {
  GENERATE_OUTFITS_RATE_LIMIT,
  handleGenerateOutfits,
  type GenerateOutfitsHttpRequest,
} from '../../../supabase/functions/generate-outfits/handler.ts';
import { handleTagItem, TAG_ITEM_RATE_LIMIT, type TagItemHttpRequest } from '../../../supabase/functions/tag-item/handler.ts';
import { sampleSummaries } from '@/ai/testing/outfit-fixtures';
import { CONNECTION_CHECK_IMAGE } from '@/ai/connection-check';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { modelReply, VALID_MODEL_TAGS } from './testing/model-fakes';

/** Built at run time so no token- or key-like literal sits in the repo. */
const TOKEN = 'e1'.repeat(32);
const API_KEY = ['test', 'key', 'r'.repeat(24)].join('-');

describe('FixedWindowRateLimiter', () => {
  it('allows `limit` requests per window, refuses the rest, and opens a new window after it ends', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 3, windowMs: 60_000 });
    expect([0, 1, 2].map((t) => limiter.take(1_000 + t).ok)).toEqual([true, true, true]);
    expect(limiter.take(1_003)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(limiter.take(31_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(limiter.take(60_999)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.take(61_000)).toEqual({ ok: true });
    expect(limiter.take(61_001).ok).toBe(true);
  });

  it('does not count refused requests (a caller hammering it is let in again after the window)', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.take(0).ok).toBe(true);
    for (let t = 1; t < 1_000; t += 100) expect(limiter.take(t).ok).toBe(false);
    expect(limiter.take(1_000).ok).toBe(true);
  });

  it('starts over if the clock goes backwards', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take(100_000).ok).toBe(true);
    expect(limiter.take(50_000).ok).toBe(true);
  });

  it('rejects a nonsensical limit', () => {
    expect(() => new FixedWindowRateLimiter({ limit: 0, windowMs: 1 })).toThrow();
    expect(() => new FixedWindowRateLimiter({ limit: 1.5, windowMs: 1 })).toThrow();
    expect(() => new FixedWindowRateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });

  it('uses the documented limits: tag-item 60 and generate-outfits 20 a minute', () => {
    expect(TAG_ITEM_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60_000 });
    expect(GENERATE_OUTFITS_RATE_LIMIT).toEqual({ limit: 20, windowMs: 60_000 });
    for (const doc of ['docs/api/tag-item.md', 'docs/api/generate-outfits.md']) {
      const text = readText(joinPath(REPO_ROOT, doc));
      expect(text).toContain('`rate_limited`');
      expect(text).toMatch(/per (function )?instance/);
    }
    expect(readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md'))).toContain('60 requests a minute');
    expect(readText(joinPath(REPO_ROOT, 'docs/api/generate-outfits.md'))).toContain('20 requests a minute');
  });

  it('each Deno entry point keeps one limiter per instance and passes it to its handler', () => {
    for (const [file, limit] of [
      ['tag-item/index.ts', 'TAG_ITEM_RATE_LIMIT'],
      ['generate-outfits/index.ts', 'GENERATE_OUTFITS_RATE_LIMIT'],
    ]) {
      const source = readText(joinPath(REPO_ROOT, 'supabase/functions', file));
      expect(source).toMatch(new RegExp(`^const rateLimiter = new FixedWindowRateLimiter\\(${limit}\\);$`, 'm'));
      expect(source).toMatch(/anthropicApiKey: Deno\.env\.get\('ANTHROPIC_API_KEY'\), rateLimiter \}/);
    }
  });
});

function bodyReader(text: string) {
  return jest.fn(async () => ({ ok: true as const, text }));
}

describe.each([
  {
    name: 'tag-item',
    run: (req: TagItemHttpRequest, env: Parameters<typeof handleTagItem>[1]) => handleTagItem(req, env),
    body: JSON.stringify({ imageBase64: CONNECTION_CHECK_IMAGE.base64, contentType: 'image/jpeg' }),
    reply: () => modelReply(VALID_MODEL_TAGS),
    code: (body: unknown) => tagItemErrorCode(body),
  },
  {
    name: 'generate-outfits',
    run: (req: GenerateOutfitsHttpRequest, env: Parameters<typeof handleGenerateOutfits>[1]) => handleGenerateOutfits(req, env),
    body: JSON.stringify({ request: 'for summer', items: sampleSummaries() }),
    reply: () => modelReply({ looks: [{ items: ['i1', 'i3', 'i6'], rationale: 'Easy.' }] }),
    code: (body: unknown) => readGenerateOutfitsError(body)?.code ?? null,
  },
])('$name rate limit', ({ run, body, reply, code }) => {
  function setup(limit: number) {
    let clock = 0;
    const fetchMock = jest.fn(async () => reply());
    const env = {
      devToken: TOKEN,
      anthropicApiKey: API_KEY,
      fetch: fetchMock as unknown as typeof fetch,
      log: () => undefined,
      now: () => clock,
      rateLimiter: new FixedWindowRateLimiter({ limit, windowMs: 60_000 }),
    };
    const req = (authorization: string | null = `Bearer ${TOKEN}`) => {
      const readBody = bodyReader(body);
      return { req: { method: 'POST', authorization, contentLength: null, readBody }, readBody };
    };
    return { env, req, fetchMock, advance: (ms: number) => (clock += ms) };
  }

  it('answers 429 rate_limited with Retry-After once the window is full, without reading the body or calling the model', async () => {
    const { env, req, fetchMock, advance } = setup(2);
    expect((await run(req().req, env)).status).toBe(200);
    expect((await run(req().req, env)).status).toBe(200);
    advance(15_000);
    const { req: third, readBody } = req();
    const refused = await run(third, env);
    expect(refused.status).toBe(429);
    expect(code(refused.body)).toBe('rate_limited');
    expect(refused.headers['Retry-After']).toBe('45');
    expect(refused.headers['Cache-Control']).toBe('no-store');
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    advance(45_000);
    expect((await run(req().req, env)).status).toBe(200);
  });

  it('does not count callers without the token (they get 401, never 429)', async () => {
    const { env, req } = setup(1);
    for (let i = 0; i < 5; i++) expect((await run(req(null).req, env)).status).toBe(401);
    expect((await run(req().req, env)).status).toBe(200);
    expect((await run(req(null).req, env)).status).toBe(401);
    expect((await run(req().req, env)).status).toBe(429);
  });

  it('counts an authorized request even when its body is bad', async () => {
    const { env } = setup(1);
    const bad = { method: 'POST', authorization: `Bearer ${TOKEN}`, contentLength: null, readBody: bodyReader('{') };
    expect((await run(bad, env)).status).toBe(400);
    expect((await run(bad, env)).status).toBe(429);
  });

  it('has no limit when no limiter is given (the handler tests)', async () => {
    const { env, req } = setup(1);
    const { rateLimiter: _unused, ...unlimited } = env;
    for (let i = 0; i < 3; i++) expect((await run(req().req, unlimited)).status).toBe(200);
  });
});
