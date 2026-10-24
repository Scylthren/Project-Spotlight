import { InMemoryDevTokenStore, type DevTokenStore } from '@/data/dev-token-store';

import { handleGenerateOutfits, type GenerateOutfitsEnv } from '../../../supabase/functions/generate-outfits/handler.ts';
import { modelReply } from '../edge-functions/testing/model-fakes';

import { validateGenerateOutfitsRequest } from './generate-outfits-contract';
import { DEFAULT_OUTFIT_TIMEOUT_MS, RemoteOutfitGenerator } from './remote-outfit-generator';
import { closetItem } from './testing/outfit-fixtures';

const URL = 'https://example.supabase.co/functions/v1/generate-outfits';
/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = '7a'.repeat(32);

const closet = [closetItem('t', 'top', { name: 'Grey tee' }), closetItem('b', 'bottom'), closetItem('s', 'shoes')];
const STUB_REPLY = { apiVersion: 1, stub: true, outfits: [{ itemIds: ['t', 'b', 's'], rationale: 'Stub look 1: top + bottom + shoes.' }] };

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text } as unknown as Response;
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
type FetchMock = jest.Mock<Promise<Response>, FetchArgs>;
const mockFetch = (impl: (...args: FetchArgs) => Promise<Response>): FetchMock => jest.fn(impl);

function setup(options: { respond?: FetchMock; store?: DevTokenStore; url?: string | null; timeoutMs?: number } = {}) {
  const fetchMock: FetchMock = options.respond ?? mockFetch(async () => jsonResponse(200, STUB_REPLY));
  const generator = new RemoteOutfitGenerator({
    url: options.url === undefined ? URL : options.url,
    tokenStore: options.store ?? new InMemoryDevTokenStore(TOKEN),
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs: options.timeoutMs,
  });
  return { generator, fetchMock };
}

function hangingFetch(): FetchMock {
  return mockFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
}

/** The function's env with a fake model that always answers `looks` (refs i1, i2, ... in the order the closet is sent). */
function functionEnv(looks: { items: string[]; rationale: string }[]): GenerateOutfitsEnv {
  return {
    devToken: TOKEN,
    anthropicApiKey: ['test', 'key', 'q'.repeat(24)].join('-'),
    fetch: (async () => modelReply({ looks })) as unknown as typeof fetch,
    log: () => undefined,
  };
}

const ok = (outfits: unknown[], extra: object = {}) => ({ ok: true, stub: true, droppedOutfits: 0, omittedItems: 0, outfits, ...extra });

describe('RemoteOutfitGenerator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends avoid (Restyle) as the contract request, leaving out sets with an id it does not send', async () => {
    const { generator, fetchMock } = setup();
    await generator.generate({ request: 'for summer', items: closet, avoid: [['t', 'b', 's'], ['gone', 'b']] });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.avoid).toEqual([['t', 'b', 's']]);
    expect(validateGenerateOutfitsRequest(body).ok).toBe(true);
  });

  it('round-trips avoid through the real handler: an avoided look is not answered again', async () => {
    const respond = mockFetch(async (_input, init) => {
      const result = await handleGenerateOutfits(
        {
          method: 'POST',
          authorization: `Bearer ${TOKEN}`,
          contentLength: null,
          readBody: async () => ({ ok: true, text: String(init?.body) }),
        },
        functionEnv([{ items: ['i1', 'i2', 'i3'], rationale: 'The same look again.' }]),
      );
      return jsonResponse(result.status, result.body);
    });
    const { generator } = setup({ respond });
    const outcome = await generator.generate({ request: 'again', items: closet, avoid: [['s', 'b', 't']] });
    expect(outcome).toEqual(ok([], { stub: false, model: 'claude-haiku-5-5' }));
  });

  it('POSTs the contract request (text summaries only) with the bearer token and returns the looks', async () => {
    const { generator, fetchMock } = setup();
    expect(await generator.generate({ request: '  for summer ', items: closet })).toEqual(ok(STUB_REPLY.outfits));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(init?.signal).toBeDefined();
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      request: '  for summer ',
      items: [
        { id: 't', category: 'top', colors: ['black'], seasons: ['spring'], name: 'Grey tee' },
        { id: 'b', category: 'bottom', colors: ['black'], seasons: ['spring'] },
        { id: 's', category: 'shoes', colors: ['black'], seasons: ['spring'] },
      ],
    });
    expect(validateGenerateOutfitsRequest(body).ok).toBe(true);
    expect(String(init?.body)).not.toMatch(/closet-images|photo/);
  });

  it('sends mode and weather when given', async () => {
    const { generator, fetchMock } = setup();
    const weather = { highC: 20, lowC: 10, rainChance: 0, windKph: 5, conditions: 'Sunny' };
    await generator.generate({ request: '', items: closet, mode: 'weather', weather });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ request: '', mode: 'weather', weather });
  });

  it('round-trips through the real function handler (with a fake model)', async () => {
    const respond = mockFetch(async (_url, init) => {
      const text = String(init?.body);
      const headers = init?.headers as Record<string, string>;
      const result = await handleGenerateOutfits(
        { method: init?.method ?? 'GET', authorization: headers.Authorization, contentLength: null, readBody: async () => ({ ok: true, text }) },
        functionEnv([
          { items: ['i3', 'i1', 'i2'], rationale: 'Look one.' },
          { items: ['i4', 'i3'], rationale: 'Look two.' },
        ]),
      );
      return jsonResponse(result.status, result.body);
    });
    const { generator } = setup({ respond });
    expect(await generator.generate({ request: 'emo vibes', items: [...closet, closetItem('d', 'dress')] })).toEqual(
      ok(
        [
          { itemIds: ['t', 'b', 's'], rationale: 'Look one.' },
          { itemIds: ['d', 's'], rationale: 'Look two.' },
        ],
        { stub: false, model: 'claude-haiku-5-5' },
      ),
    );
    expect(await generator.generate({ request: 'emo vibes', items: [closetItem('t', 'top'), closetItem('s', 'shoes')] })).toEqual({
      ok: false,
      failure: 'not-enough-items',
      missing: ['bottom', 'dress'],
    });
  });

  it('drops any look that names an item it did not send, and counts it', async () => {
    const reply = {
      apiVersion: 1,
      stub: false,
      outfits: [
        { itemIds: ['t', 'b', 'ghost'], rationale: 'Has a stranger.' },
        { itemIds: ['t', 'b', 's'], rationale: 'Fine.' },
      ],
    };
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(200, reply)) });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual(
      ok([{ itemIds: ['t', 'b', 's'], rationale: 'Fine.' }], { stub: false, droppedOutfits: 1 }),
    );
  });

  it('counts only the items it could not send, not the ones the function left out of its prompt', async () => {
    const reply = { apiVersion: 1, stub: false, outfits: [{ itemIds: ['t', 'b', 's'], rationale: 'Fine.' }], omittedItems: 7 };
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(200, reply)) });
    const outcome = await generator.generate({ request: 'x', items: [...closet, closetItem('bad id', 'top')] });
    expect(outcome).toMatchObject({ ok: true, omittedItems: 1 });
  });

  it('passes on the model named in the reply usage (kept with saved looks), and none for the stub', async () => {
    const usage = { model: 'claude-haiku-5-5', attempts: 1, inputTokens: 3000, outputTokens: 200 };
    const reply = { apiVersion: 1, stub: false, outfits: [{ itemIds: ['t', 'b', 's'], rationale: 'Fine.' }], usage };
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(200, reply)) });
    expect(await generator.generate({ request: 'x', items: closet })).toMatchObject({ ok: true, model: 'claude-haiku-5-5' });
    const stub = await setup().generator.generate({ request: 'x', items: closet });
    expect(stub.ok && 'model' in stub).toBe(false);
  });

  it('reports items it could not send', async () => {
    const { generator } = setup();
    const outcome = await generator.generate({ request: 'x', items: [...closet, closetItem('bad id', 'top')] });
    expect(outcome).toMatchObject({ ok: true, omittedItems: 1 });
  });

  it.each([
    ['an empty closet', [], ['top', 'bottom', 'dress']],
    ['only tops and shoes', [closetItem('t', 'top'), closetItem('s', 'shoes')], ['bottom', 'dress']],
  ])('says what is missing for %s without a request', async (_name, items, missing) => {
    const { generator, fetchMock } = setup();
    expect(await generator.generate({ request: 'x', items })).toEqual({ ok: false, failure: 'not-enough-items', missing });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads not_enough_items from the function (422)', async () => {
    const body = { error: { code: 'not_enough_items', message: 'x', missing: ['top', 'dress'] } };
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(422, body)) });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'not-enough-items', missing: ['top', 'dress'] });
  });

  it.each([
    ['another code', { error: { code: 'internal' } }],
    ['not JSON', '<html>'],
  ])('treats a 422 with %s as server', async (_name, body) => {
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(422, body)) });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'server' });
  });

  it.each([
    ['empty text', ''],
    ['only spaces', '   '],
    ['201 characters', 'x'.repeat(201)],
  ])('does not send a request with %s (rejected)', async (_name, request) => {
    const { generator, fetchMock } = setup();
    expect(await generator.generate({ request, items: closet })).toEqual({ ok: false, failure: 'rejected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request without a URL or a token, or when the store fails', async () => {
    const noUrl = setup({ url: null });
    expect(await noUrl.generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'not-configured' });
    const noToken = setup({ store: new InMemoryDevTokenStore(null) });
    expect(await noToken.generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'no-token' });
    const broken: DevTokenStore = {
      get: async () => {
        throw new Error('keychain locked');
      },
      set: async () => {},
      clear: async () => {},
    };
    const failing = setup({ store: broken });
    expect(await failing.generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'no-token' });
    for (const { fetchMock } of [noUrl, noToken, failing]) expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [400, 'rejected'],
    [404, 'server'],
    [405, 'server'],
    [500, 'server'],
    [502, 'server'],
    [503, 'server'],
    [504, 'server'],
    [201, 'server'],
  ])('maps status %i to %s', async (status, failure) => {
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(status, { error: { code: 'x' } })) });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure });
  });

  it.each([
    ['not JSON', '<html>gateway</html>'],
    ['the wrong shape', { ok: true }],
    ['another API version', { ...STUB_REPLY, apiVersion: 2 }],
    ['a malformed outfit', { ...STUB_REPLY, outfits: [{ itemIds: ['t'], rationale: '' }] }],
  ])('treats a 200 with %s as invalid-response', async (_name, body) => {
    const { generator } = setup({ respond: mockFetch(async () => jsonResponse(200, body)) });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'invalid-response' });
  });

  it('reports network errors as offline and never rejects', async () => {
    for (const thrown of [new TypeError('Network request failed'), 'boom']) {
      const { generator } = setup({
        respond: mockFetch(async () => {
          throw thrown;
        }),
      });
      await expect(generator.generate({ request: 'x', items: closet })).resolves.toEqual({ ok: false, failure: 'offline' });
    }
  });

  it('reports a connection lost while reading the body as offline', async () => {
    const respond = mockFetch(
      async () =>
        ({
          status: 200,
          text: async () => {
            throw new TypeError('Network request failed');
          },
        }) as unknown as Response,
    );
    const { generator } = setup({ respond });
    expect(await generator.generate({ request: 'x', items: closet })).toEqual({ ok: false, failure: 'offline' });
  });

  it('aborts and reports a timeout after 30 s (D4)', async () => {
    expect(DEFAULT_OUTFIT_TIMEOUT_MS).toBe(30_000);
    jest.useFakeTimers();
    const respond = hangingFetch();
    const { generator } = setup({ respond });
    const pending = generator.generate({ request: 'x', items: closet });
    await jest.advanceTimersByTimeAsync(DEFAULT_OUTFIT_TIMEOUT_MS - 1);
    expect(respond.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, failure: 'timeout' });
    expect(respond.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('times out while the body is still arriving', async () => {
    jest.useFakeTimers();
    const respond = mockFetch(async (_input, init) => {
      const signal = init?.signal;
      return {
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      } as unknown as Response;
    });
    const { generator } = setup({ respond, timeoutMs: 1000 });
    const pending = generator.generate({ request: 'x', items: closet });
    await jest.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ ok: false, failure: 'timeout' });
  });

  it('aborts the request and resolves cancelled when the caller aborts', async () => {
    const respond = hangingFetch();
    const { generator } = setup({ respond });
    const controller = new AbortController();
    const pending = generator.generate({ request: 'x', items: closet }, { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    expect(await pending).toEqual({ ok: false, failure: 'cancelled' });
    expect(respond.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('sends nothing when already aborted', async () => {
    const { generator, fetchMock } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await generator.generate({ request: 'x', items: closet }, { signal: controller.signal })).toEqual({ ok: false, failure: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears its timer and abort listener after an answer', async () => {
    jest.useFakeTimers();
    const { generator } = setup();
    const signal = new AbortController().signal;
    const remove = jest.spyOn(signal, 'removeEventListener');
    await generator.generate({ request: 'x', items: closet }, { signal });
    expect(jest.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
