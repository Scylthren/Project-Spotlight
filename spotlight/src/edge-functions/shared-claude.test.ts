/**
 * The shared Messages API call (`supabase/functions/_shared/claude.ts`) on
 * its own. Both functions' model tests also cover it through their
 * handlers. `fetch` is always a fake; nothing leaves Jest.
 */
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  callClaude,
  classifyProviderStatus,
  type ProviderEnv,
} from '../../../supabase/functions/_shared/claude.ts';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { fakeResponse, modelReply } from './testing/model-fakes';

/** Built at run time so no key-like literal sits in the repo. */
const API_KEY = ['test', 'key', 's'.repeat(24)].join('-');

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function env(fetchImpl: (...args: FetchArgs) => Promise<Response>, log = jest.fn()): ProviderEnv & { fetchMock: jest.Mock } {
  const fetchMock = jest.fn(fetchImpl);
  let clock = 1_000;
  return { apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch, now: () => (clock += 10), log, fetchMock };
}

describe('callClaude', () => {
  afterEach(() => jest.useRealTimers());

  it('posts the JSON body with the key, version and content type, and returns the parsed body and call info', async () => {
    const e = env(async () => modelReply({ a: 1 }, { inputTokens: 11, outputTokens: 22 }));
    const result = await callClaude({ model: 'm', messages: [] }, 5_000, e);
    const [url, init] = e.fetchMock.mock.calls[0] as FetchArgs;
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'x-api-key': API_KEY, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ model: 'm', messages: [] });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result.kind).toBe('body');
    expect(result.info).toEqual({ status: 200, stopReason: 'end_turn', inputTokens: 11, outputTokens: 22, latencyMs: 10 });
  });

  it('returns a null body for a 200 that is not JSON, and null tokens when the reply has none', async () => {
    const result = await callClaude({}, 5_000, env(async () => fakeResponse(200, 'not json')));
    expect(result).toMatchObject({ kind: 'body', body: null, info: { status: 200, stopReason: null, inputTokens: null, outputTokens: null } });
  });

  it.each<[number, string]>([
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [529, 'unavailable'],
    [400, 'rejected'],
    [401, 'rejected'],
  ])('maps status %d to %s and cancels the unread error body', async (status, error) => {
    const cancel = jest.fn(async () => undefined);
    const e = env(async () => ({ status, body: { cancel }, text: async () => 'echo of input' }) as unknown as Response);
    const result = await callClaude({}, 5_000, e);
    expect(result).toMatchObject({ kind: 'error', error, info: { status, inputTokens: null } });
    expect(cancel).toHaveBeenCalled();
    expect(classifyProviderStatus(status)).toBe(error);
  });

  it('maps a network error, or a reply that drops while reading, to unavailable (network_error)', async () => {
    const failed = await callClaude({}, 5_000, env(async () => Promise.reject(new Error('dns'))));
    expect(failed).toMatchObject({ kind: 'error', error: 'unavailable', info: { status: 'network_error' } });
    const dropped = await callClaude(
      {},
      5_000,
      env(async () => ({ status: 200, text: async () => Promise.reject(new Error('reset')) }) as unknown as Response),
    );
    expect(dropped).toMatchObject({ kind: 'error', error: 'unavailable', info: { status: 'network_error' } });
  });

  it('times out, aborting the request, even when fetch ignores the signal', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const e = env(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined); // never settles
    });
    const pending = callClaude({}, 3_000, e);
    await jest.advanceTimersByTimeAsync(2_999);
    expect(signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ kind: 'error', error: 'timeout', info: { status: 'timeout' } });
    expect(signal?.aborted).toBe(true);
  });

  it('never logs (each function writes its own line)', async () => {
    const log = jest.fn();
    await callClaude({}, 5_000, env(async () => modelReply({}), log));
    await callClaude({}, 5_000, env(async () => fakeResponse(503, ''), log));
    expect(log).not.toHaveBeenCalled();
  });

  it('is the only place either function talks to the Messages API', () => {
    for (const file of ['tag-item/claude.ts', 'generate-outfits/claude.ts']) {
      const source = readText(joinPath(REPO_ROOT, 'supabase/functions', file));
      expect(source).toContain("from '../_shared/claude.ts'");
      expect(source).not.toContain('api.anthropic.com');
      expect(source).not.toContain('AbortController');
    }
  });
});
