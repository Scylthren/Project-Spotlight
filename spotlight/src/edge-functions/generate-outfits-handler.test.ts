/**
 * The generate-outfits function's request handling: method, token, key,
 * body and closet checks, and the answer shape with a fake model (the model
 * call itself is covered in `generate-outfits-model.test.ts`). The logic
 * lives in plain TypeScript under `supabase/functions/` (the Deno entry
 * point is a thin adapter). `fetch` is always a fake.
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

import { modelReply } from './testing/model-fakes';

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

/** Built at run time so no key-like literal sits in the repo. */
const API_KEY = ['test', 'key', 'z'.repeat(24)].join('-');

/** The model's looks for sampleSummaries, by ref (i1 top-1, i2 top-2, i3 bottom-1, i4 bottom-2, i5 dress-1, i6 shoes-1, i7 shoes-2, i8 coat-1, i9 bag-1). */
const SAMPLE_LOOKS = {
  looks: [
    { items: ['i1', 'i3', 'i6'], rationale: 'Easy and light.' },
    { items: ['i5', 'i7', 'i9'], rationale: 'A dress with a bag.' },
    { items: ['i2', 'i4', 'i8', 'i6'], rationale: 'Layered.' },
  ],
};

const log = jest.fn();
const fetchMock = jest.fn(async (..._args: unknown[]): Promise<Response> => modelReply(SAMPLE_LOOKS));
const env = { devToken: TOKEN, anthropicApiKey: API_KEY, log, fetch: fetchMock as unknown as typeof fetch };

beforeEach(() => {
  log.mockClear();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async () => modelReply(SAMPLE_LOOKS));
});

/** The log lines, parsed. */
const logLines = () => log.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);

function errorOf(body: unknown) {
  return (body as { error?: { code?: string; message?: string; missing?: string[] } }).error;
}

describe('handleGenerateOutfits', () => {
  it('answers a valid request with the model\'s valid looks (real ids, category order), stub false, usage and omittedItems', async () => {
    const result = await handleGenerateOutfits(request().req, env);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      apiVersion: 1,
      stub: false,
      outfits: [
        { itemIds: ['top-1', 'bottom-1', 'shoes-1'], rationale: 'Easy and light.' },
        { itemIds: ['dress-1', 'shoes-2', 'bag-1'], rationale: 'A dress with a bag.' },
        { itemIds: ['top-2', 'bottom-2', 'coat-1', 'shoes-1'], rationale: 'Layered.' },
      ],
      usage: { model: 'claude-haiku-5-5', attempts: 1, inputTokens: 1234, outputTokens: 56 },
      omittedItems: 0,
    });
    expect(validateGenerateOutfitsResponse(JSON.parse(JSON.stringify(result.body))).ok).toBe(true);
    expect(result.headers['Content-Type']).toMatch(/^application\/json/);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs one line per model call and one per answer, counts only (no request text, ids, names, reply or token)', async () => {
    const items = [summary('secret-id', 'dress', { name: 'Secret name' })];
    fetchMock.mockImplementation(async () => modelReply({ looks: [{ items: ['i1'], rationale: 'Private reason' }] }));
    await handleGenerateOutfits(request({ body: JSON.stringify({ request: 'private words', items }) }).req, env);
    expect(log).toHaveBeenCalledTimes(2);
    const [call, answer] = logLines();
    expect(call).toMatchObject({ fn: 'generate-outfits', event: 'provider_call', attempt: 1, prompt_items: 1, outcome: 'ok', looks: 1, valid: 1 });
    expect(answer).toEqual({
      fn: 'generate-outfits',
      event: 'answer',
      mode: 'request',
      items: 1,
      prompt_items: 1,
      omitted: 0,
      avoid: 0,
      attempts: 1,
      outfits: 1,
    });
    const all = log.mock.calls.map((c) => c[0] as string).join('\n');
    expect(all).not.toMatch(/secret|Secret|private|Private/);
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(API_KEY);
  });

  it('drops a look that repeats one in avoid (Restyle), and tells the model about the avoided looks', async () => {
    const avoid = [['top-1', 'bottom-1', 'shoes-1']];
    const result = await handleGenerateOutfits(
      request({ body: JSON.stringify({ request: 'for summer', items: sampleSummaries(), avoid }) }).req,
      env,
    );
    expect(result.status).toBe(200);
    const outfits = (result.body as { outfits: { itemIds: string[] }[] }).outfits.map((o) => o.itemIds);
    expect(outfits).toEqual([
      ['dress-1', 'shoes-2', 'bag-1'],
      ['top-2', 'bottom-2', 'coat-1', 'shoes-1'],
    ]);
    const prompt = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).messages[0].content[0].text as string;
    expect(prompt).toContain('<avoid>\n["i1","i3","i6"]\n</avoid>');
    expect(logLines()[0]).toMatchObject({ avoided: 1, valid: 2 });
  });

  it('answers 200 with no looks when the model, after one retry, only repeats avoided looks', async () => {
    const items = [summary('t', 'top'), summary('b', 'bottom'), summary('s', 'shoes')];
    fetchMock.mockImplementation(async () => modelReply({ looks: [{ items: ['i1', 'i2', 'i3'], rationale: 'Again.' }] }));
    const body = JSON.stringify({ request: 'for summer', items, avoid: [['t', 'b', 's']] });
    const result = await handleGenerateOutfits(request({ body }).req, env);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ apiVersion: 1, stub: false, outfits: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed avoid with 400 bad_request', async () => {
    for (const avoid of [[[]], [['a', 'a']], [['bad id']], 'x', Array.from({ length: 10 }, () => ['a'])]) {
      const body = JSON.stringify({ request: 'for summer', items: sampleSummaries(), avoid });
      const result = await handleGenerateOutfits(request({ body }).req, env);
      expect(result.status).toBe(400);
      expect(errorOf(result.body)?.code).toBe('bad_request');
      expect(errorOf(result.body)?.message).toMatch(/^avoid/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts weather and random modes', async () => {
    const weather = { highC: 20, lowC: 10, rainChance: 0, windKph: 5, conditions: 'clear' };
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
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('words the message for each case', () => {
    expect(notEnoughItemsMessage(['top', 'bottom', 'dress'])).toBe('The closet cannot form an outfit: add a top and a bottom, or a dress.');
  });

  it('tag-item still exposes the shared body helpers (refactor kept its imports)', () => {
    expect(tagItemReadCapped).toBe(readCapped);
  });
});
