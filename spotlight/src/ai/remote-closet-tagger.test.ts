import { InMemoryDevTokenStore, type DevTokenStore } from '@/data/dev-token-store';

import { CONNECTION_CHECK_IMAGE } from './connection-check';
import { DEFAULT_TAG_TIMEOUT_MS, RemoteClosetTagger } from './remote-closet-tagger';
import { STUB_TAG_ITEM_RESPONSE, validateTagItemRequest } from './tag-item-contract';

const URL = 'https://example.supabase.co/functions/v1/tag-item';
/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = '9e'.repeat(32);

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text } as unknown as Response;
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
type FetchMock = jest.Mock<Promise<Response>, FetchArgs>;

const mockFetch = (impl: (...args: FetchArgs) => Promise<Response>): FetchMock => jest.fn(impl);

function setup(options: { respond?: FetchMock; store?: DevTokenStore; url?: string | null; timeoutMs?: number } = {}) {
  const fetchMock: FetchMock = options.respond ?? mockFetch(async () => jsonResponse(200, STUB_TAG_ITEM_RESPONSE));
  const tagger = new RemoteClosetTagger({
    url: options.url === undefined ? URL : options.url,
    tokenStore: options.store ?? new InMemoryDevTokenStore(TOKEN),
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs: options.timeoutMs,
  });
  return { tagger, fetchMock };
}

/** A fetch that never answers until its signal aborts, like a stalled network. */
function hangingFetch(): FetchMock {
  return mockFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
}

describe('RemoteClosetTagger', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('POSTs the contract request with the bearer token and returns the validated tags', async () => {
    const { tagger, fetchMock } = setup();
    const outcome = await tagger.tag(CONNECTION_CHECK_IMAGE);
    expect(outcome).toEqual({ ok: true, tags: STUB_TAG_ITEM_RESPONSE.tags, stub: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(init?.signal).toBeDefined();
    const body = JSON.parse(String(init?.body));
    expect(validateTagItemRequest(body)).toEqual({
      ok: true,
      value: { imageBase64: CONNECTION_CHECK_IMAGE.base64, contentType: 'image/jpeg' },
    });
  });

  it('makes no request without a URL', async () => {
    const { tagger, fetchMock } = setup({ url: null });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request without a saved token, or when the store fails', async () => {
    const empty = setup({ store: new InMemoryDevTokenStore(null) });
    expect(await empty.tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'no-token' });
    expect(empty.fetchMock).not.toHaveBeenCalled();

    const broken: DevTokenStore = {
      get: async () => {
        throw new Error('keychain locked');
      },
      set: async () => {},
      clear: async () => {},
    };
    const failing = setup({ store: broken });
    expect(await failing.tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'no-token' });
    expect(failing.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [400, 'rejected'],
    [404, 'server'],
    [405, 'server'],
    [500, 'server'],
    [503, 'server'],
    [201, 'server'],
  ])('maps status %i to %s', async (status, failure) => {
    const { tagger } = setup({ respond: mockFetch(async () => jsonResponse(status, { error: { code: 'x' } })) });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure });
  });

  it('reports a network error as offline', async () => {
    const respond: FetchMock = mockFetch(async () => {
      throw new TypeError('Network request failed');
    });
    const { tagger } = setup({ respond });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'offline' });
  });

  it('reports a connection lost while reading the body as offline', async () => {
    const respond: FetchMock = mockFetch(
      async () =>
        ({
          status: 200,
          text: async () => {
            throw new TypeError('Network request failed');
          },
        }) as unknown as Response,
    );
    const { tagger } = setup({ respond });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'offline' });
  });

  it('aborts and reports a timeout when no answer arrives in time', async () => {
    jest.useFakeTimers();
    const respond = hangingFetch();
    const { tagger } = setup({ respond });
    const pending = tagger.tag(CONNECTION_CHECK_IMAGE);
    await jest.advanceTimersByTimeAsync(DEFAULT_TAG_TIMEOUT_MS - 1);
    expect(respond.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, failure: 'timeout' });
    expect(respond.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('times out while the body is still arriving', async () => {
    jest.useFakeTimers();
    const respond: FetchMock = mockFetch(async (_input, init) => {
      const signal = init?.signal;
      return {
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      } as unknown as Response;
    });
    const { tagger } = setup({ respond, timeoutMs: 1000 });
    const pending = tagger.tag(CONNECTION_CHECK_IMAGE);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ ok: false, failure: 'timeout' });
  });

  it('clears its timer after an answer', async () => {
    jest.useFakeTimers();
    const { tagger } = setup();
    await tagger.tag(CONNECTION_CHECK_IMAGE);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ['not JSON', '<html>gateway</html>'],
    ['empty', ''],
    ['the wrong shape', { ok: true }],
    ['an unknown category', { ...STUB_TAG_ITEM_RESPONSE, tags: { ...STUB_TAG_ITEM_RESPONSE.tags, category: 'hat' } }],
    ['another API version', { ...STUB_TAG_ITEM_RESPONSE, apiVersion: 99 }],
  ])('treats a 200 with %s as invalid-response', async (_name, body) => {
    const { tagger } = setup({ respond: mockFetch(async () => jsonResponse(200, body)) });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'invalid-response' });
  });

  it('never rejects, even when fetch throws a non-Error', async () => {
    const respond: FetchMock = mockFetch(async () => {
      throw 'boom';
    });
    const { tagger } = setup({ respond });
    await expect(tagger.tag(CONNECTION_CHECK_IMAGE)).resolves.toEqual({ ok: false, failure: 'offline' });
  });

  it('reads the token on every call, so a newly saved token is used at once', async () => {
    const store = new InMemoryDevTokenStore(TOKEN);
    const { tagger, fetchMock } = setup({ store });
    await tagger.tag(CONNECTION_CHECK_IMAGE);
    const next = 'f0'.repeat(32);
    await store.set(next);
    await tagger.tag(CONNECTION_CHECK_IMAGE);
    const headers = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${next}`);
  });
});
