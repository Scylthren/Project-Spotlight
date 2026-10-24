/**
 * The generate-outfits function's request handling (slice 1: the stub),
 * which lives in plain TypeScript under `supabase/functions/` (the Deno
 * entry point is a thin adapter).
 */
import {
  GENERATE_OUTFITS_MAX_BODY_BYTES,
  validateGenerateOutfitsResponse,
} from '../../../supabase/functions/_shared/generate-outfits-contract.ts';
import { readCapped } from '../../../supabase/functions/_shared/http-body.ts';
import {
  handleGenerateOutfits,
  notEnoughItemsMessage,
  type GenerateOutfitsHttpRequest,
} from '../../../supabase/functions/generate-outfits/handler.ts';
import { readCapped as tagItemReadCapped } from '../../../supabase/functions/tag-item/handler.ts';
import type { CappedBody } from '../../../supabase/functions/_shared/http-body.ts';
import { sampleSummaries, summary } from '@/ai/testing/outfit-fixtures';

/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = 'cd'.repeat(32);
const VALID_BODY = JSON.stringify({ request: 'for summer', items: sampleSummaries() });

function request(overrides: Partial<GenerateOutfitsHttpRequest> & { body?: string } = {}) {
  const { body = VALID_BODY, ...rest } = overrides;
  const readBody = jest.fn(async (maxBytes: number): Promise<CappedBody> =>
    new TextEncoder().encode(body).length > maxBytes ? { ok: false, reason: 'too_large' } : { ok: true, text: body },
  );
  const req: GenerateOutfitsHttpRequest = { method: 'POST', authorization: `Bearer ${TOKEN}`, contentLength: null, readBody, ...rest };
  return { req, readBody };
}

const log = jest.fn();
const env = { devToken: TOKEN, log };

beforeEach(() => log.mockClear());

function errorOf(body: unknown) {
  return (body as { error?: { code?: string; message?: string; missing?: string[] } }).error;
}

describe('handleGenerateOutfits', () => {
  it('answers a valid request with the stub\'s looks, which the app\'s validator accepts', async () => {
    const result = await handleGenerateOutfits(request().req, env);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      apiVersion: 1,
      stub: true,
      outfits: [
        { itemIds: ['top-1', 'bottom-1', 'shoes-1'], rationale: 'Stub look 1: top + bottom + shoes.' },
        { itemIds: ['top-1', 'bottom-2', 'shoes-2'], rationale: 'Stub look 2: top + bottom + shoes.' },
        { itemIds: ['top-2', 'bottom-1', 'shoes-1'], rationale: 'Stub look 3: top + bottom + shoes.' },
      ],
    });
    expect(validateGenerateOutfitsResponse(JSON.parse(JSON.stringify(result.body))).ok).toBe(true);
    expect(result.headers['Content-Type']).toMatch(/^application\/json/);
    expect(result.headers['Cache-Control']).toBe('no-store');
  });

  it('logs one line with counts only (no request text, ids or token)', async () => {
    const items = [summary('secret-id', 'dress', { name: 'Secret name' })];
    await handleGenerateOutfits(request({ body: JSON.stringify({ request: 'private words', items }) }).req, env);
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toEqual({ fn: 'generate-outfits', event: 'stub', items: 1, outfits: 1, rejected: 0 });
    expect(line).not.toMatch(/secret|Secret|private/);
    expect(line).not.toContain(TOKEN);
  });

  it('accepts weather and random modes (the stub ignores them)', async () => {
    const weather = { highC: 20, lowC: 10, rainChance: 0, windKph: 5, conditions: 'Sunny' };
    for (const body of [
      { request: '', items: sampleSummaries(), mode: 'random' },
      { request: '', items: sampleSummaries(), mode: 'weather', weather },
    ]) {
      const result = await handleGenerateOutfits(request({ body: JSON.stringify(body) }).req, env);
      expect(result.status).toBe(200);
    }
  });

  it.each(['GET', 'PUT', 'OPTIONS', 'DELETE'])('rejects %s with 405 and Allow: POST, before checking the token', async (method) => {
    const { req, readBody } = request({ method, authorization: null });
    const result = await handleGenerateOutfits(req, env);
    expect(result.status).toBe(405);
    expect(result.headers.Allow).toBe('POST');
    expect(errorOf(result.body)?.code).toBe('method_not_allowed');
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['not Bearer', `Basic ${TOKEN}`],
    ['wrong token', `Bearer ${'ef'.repeat(32)}`],
    ['the token plus more', `Bearer ${TOKEN}x`],
  ])('returns 401 for a %s Authorization header without reading the body', async (_name, authorization) => {
    const { req, readBody } = request({ authorization });
    const result = await handleGenerateOutfits(req, env);
    expect(result.status).toBe(401);
    expect(errorOf(result.body)?.code).toBe('unauthorized');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['too short', 'short-token'],
  ])('fails closed with 500 for a well-formed bearer token when DEV_TOKEN is %s', async (_name, devToken) => {
    const { req, readBody } = request();
    const result = await handleGenerateOutfits(req, { ...env, devToken });
    expect(result.status).toBe(500);
    expect(errorOf(result.body)?.code).toBe('server_misconfigured');
    expect(readBody).not.toHaveBeenCalled();
  });

  it('returns 401 (not 500) for a missing header even when DEV_TOKEN is unset', async () => {
    const result = await handleGenerateOutfits(request({ authorization: null }).req, { ...env, devToken: undefined });
    expect(result.status).toBe(401);
  });

  it('returns 400 too_large from a Content-Length over the limit without reading the body', async () => {
    const { req, readBody } = request({ contentLength: String(GENERATE_OUTFITS_MAX_BODY_BYTES + 1) });
    const result = await handleGenerateOutfits(req, env);
    expect(result.status).toBe(400);
    expect(errorOf(result.body)?.code).toBe('too_large');
    expect(readBody).not.toHaveBeenCalled();
  });

  it('returns 400 too_large when the body itself is over the limit', async () => {
    const big = JSON.stringify({ request: 'x', items: sampleSummaries(), pad: 'x'.repeat(GENERATE_OUTFITS_MAX_BODY_BYTES) });
    const { req, readBody } = request({ body: big, contentLength: '100' });
    const result = await handleGenerateOutfits(req, env);
    expect(result.status).toBe(400);
    expect(errorOf(result.body)?.code).toBe('too_large');
    expect(readBody).toHaveBeenCalledWith(GENERATE_OUTFITS_MAX_BODY_BYTES);
  });

  it('returns 400 bad_request for an unreadable body', async () => {
    const req: GenerateOutfitsHttpRequest = { ...request().req, readBody: async () => ({ ok: false, reason: 'unreadable' }) };
    const result = await handleGenerateOutfits(req, env);
    expect(result.status).toBe(400);
    expect(errorOf(result.body)?.code).toBe('bad_request');
  });

  it.each([
    ['not JSON', '{nope'],
    ['an empty body', ''],
    ['an empty request', JSON.stringify({ request: ' ', items: sampleSummaries() })],
    ['an empty closet', JSON.stringify({ request: 'x', items: [] })],
    ['a duplicate id', JSON.stringify({ request: 'x', items: [summary('a', 'dress'), summary('a', 'dress')] })],
    ['a bad item', JSON.stringify({ request: 'x', items: [{ id: 'a', category: 'dress' }] })],
  ])('returns 400 bad_request for %s', async (_name, body) => {
    const result = await handleGenerateOutfits(request({ body }).req, env);
    expect(result.status).toBe(400);
    expect(errorOf(result.body)?.code).toBe('bad_request');
    expect(log).not.toHaveBeenCalled();
  });

  it.each<[string, string[], string[], string]>([
    ['only tops', ['top', 'top', 'shoes'], ['bottom', 'dress'], 'add a bottom, or a dress'],
    ['only bottoms', ['bottom'], ['top', 'dress'], 'add a top, or a dress'],
    ['no clothes for a base', ['shoes', 'outerwear', 'accessory'], ['top', 'bottom', 'dress'], 'add a top and a bottom, or a dress'],
  ])('returns 422 not_enough_items for %s, saying what is missing', async (_name, categories, missing, words) => {
    const items = categories.map((category, i) => summary(`i${i}`, category as never));
    const result = await handleGenerateOutfits(request({ body: JSON.stringify({ request: 'x', items }) }).req, env);
    expect(result.status).toBe(422);
    expect(errorOf(result.body)).toEqual({ code: 'not_enough_items', message: expect.stringContaining(words), missing });
    expect(log).not.toHaveBeenCalled();
  });

  it('words the message for each case', () => {
    expect(notEnoughItemsMessage(['top', 'bottom', 'dress'])).toBe('The closet cannot form an outfit: add a top and a bottom, or a dress.');
  });

  it('tag-item still exposes the shared body helpers (refactor kept its imports)', () => {
    expect(tagItemReadCapped).toBe(readCapped);
  });
});
