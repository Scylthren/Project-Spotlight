/**
 * Tagging eval (Gate 2 slice 4): the runner. `fetch` is always a fake; no
 * request leaves Jest. Checks the request, how answers are recorded, the
 * concurrency limit, and that the token and image data never reach the run
 * file or the log.
 */
import { STUB_TAG_ITEM_RESPONSE, type ItemTags } from '../../../supabase/functions/_shared/tag-item-contract.ts';
import type { PreparedPhoto } from '../../../evals/tagging/prepare.ts';
import { parseRunRecord } from '../../../evals/tagging/run-record.ts';
import {
  buildRunRecord,
  functionUrl,
  interpretOutcome,
  makeTagItemSender,
  parseDotEnv,
  readDevToken,
  runFileName,
  runPhotos,
  serializeRunRecord,
  type EvalPhoto,
  type SendOutcome,
} from '../../../evals/tagging/runner.ts';
import { CONNECTION_CHECK_IMAGE } from '@/ai/connection-check';
import { fromBase64 } from '@/security/testing/node-files';

/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = 'e7'.repeat(32);
const URL = 'https://example.supabase.co/functions/v1/tag-item';
const IMAGE = CONNECTION_CHECK_IMAGE.base64;
const PREPARED: PreparedPhoto = { bytes: fromBase64(IMAGE), base64: IMAGE, width: 768, height: 1024 };

const TAGS: ItemTags = { ...STUB_TAG_ITEM_RESPONSE.tags };
const USAGE = { model: 'claude-haiku-5-5', attempts: 1, inputTokens: 1800, outputTokens: 70 };
const OK_BODY = { apiVersion: 1, tags: TAGS, stub: false, usage: USAGE };

function response(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text } as unknown as Response;
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function sender(reply: (args: FetchArgs) => Promise<Response>, timeoutMs?: number) {
  let clock = 1000;
  const fetchMock = jest.fn(async (...args: FetchArgs) => {
    clock += 1500;
    return reply(args);
  });
  const send = makeTagItemSender({ url: URL, token: TOKEN, fetch: fetchMock as unknown as typeof fetch, now: () => clock, timeoutMs });
  return { send, fetchMock };
}

const photo = (file: string): EvalPhoto => ({ file, sha256: `sha256-${'Q'.repeat(43)}`, path: `/photos/${file}` });

describe('configuration', () => {
  it('builds the function URL from the https project URL only', () => {
    expect(functionUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co/functions/v1/tag-item');
    expect(functionUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co/functions/v1/tag-item');
    for (const bad of [undefined, '', 'http://abc.supabase.co', 'https://abc.supabase.co/x', 'abc']) {
      expect(() => functionUrl(bad)).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
    }
  });

  it('reads .env lines', () => {
    expect(parseDotEnv('# c\nEXPO_PUBLIC_SUPABASE_URL="https://a.supabase.co"\n\nexport B=2\nbroken\n')).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: 'https://a.supabase.co',
      B: '2',
    });
  });

  it('reads the token file without echoing it on error', () => {
    expect(readDevToken(`${TOKEN}\n`)).toBe(TOKEN);
    for (const bad of ['', '  \n', `${TOKEN} ${TOKEN}`]) {
      let message = '';
      try {
        readDevToken(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/exactly one token/);
      expect(message).not.toContain(TOKEN);
    }
  });

  it('names run files by start time, sortable and without colons', () => {
    expect(runFileName('2026-10-23T09:05:07.123Z')).toBe('2026-10-23T09-05-07Z.json');
  });
});

describe('makeTagItemSender', () => {
  it('POSTs the contract request with the bearer token and reads the JSON answer', async () => {
    const { send, fetchMock } = sender(async () => response(200, OK_BODY));
    const outcome = await send(IMAGE);
    expect(outcome).toEqual({ httpStatus: 200, latencyMs: 1500, body: OK_BODY, failure: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ imageBase64: IMAGE, contentType: 'image/jpeg' });
  });

  it('reports a network failure and a non-JSON body', async () => {
    expect(await sender(async () => Promise.reject(new TypeError(`fetch failed ${TOKEN}`))).send(IMAGE)).toMatchObject({
      httpStatus: null,
      failure: 'network',
      body: null,
    });
    expect(await sender(async () => response(502, '<html>bad gateway</html>')).send(IMAGE)).toMatchObject({ httpStatus: 502, body: null, failure: null });
  });

  it('times out and aborts a request that never answers', async () => {
    let aborted = false;
    const { send } = sender(
      ([, init]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
      20,
    );
    expect(await send(IMAGE)).toMatchObject({ httpStatus: null, failure: 'timeout' });
    expect(aborted).toBe(true);
  });
});

describe('interpretOutcome', () => {
  const outcome = (httpStatus: number | null, body: unknown, failure: SendOutcome['failure'] = null): SendOutcome => ({ httpStatus, latencyMs: 900, body, failure });
  const interpret = (o: SendOutcome) => interpretOutcome(photo('a.heic'), PREPARED, o);

  it('records tags and usage from a 200', () => {
    expect(interpret(outcome(200, OK_BODY))).toEqual({
      file: 'a.heic',
      sha256: photo('a.heic').sha256,
      prepared: { width: 768, height: 1024, bytes: PREPARED.bytes.length },
      status: 'ok',
      httpStatus: 200,
      errorCode: null,
      latencyMs: 900,
      tags: TAGS,
      usage: USAGE,
    });
  });

  it('records a 200 without usage (an older function) with usage null', () => {
    expect(interpret(outcome(200, { ...OK_BODY, usage: undefined }))).toMatchObject({ status: 'ok', usage: null });
  });

  it.each<[string, SendOutcome, string]>([
    ['a contract error code', outcome(401, { error: { code: 'unauthorized', message: 'Missing or wrong token.' } }), 'unauthorized'],
    ['an upstream error', outcome(504, { error: { code: 'upstream_timeout', message: 'x' } }), 'upstream_timeout'],
    ['a status without a known code', outcome(404, { msg: 'not found' }), 'http_404'],
    ['a 200 the contract rejects', outcome(200, { apiVersion: 1, tags: { category: 'hat', colors: [], seasons: [] }, stub: false }), 'invalid_response'],
    ['a stub answer', outcome(200, STUB_TAG_ITEM_RESPONSE), 'stub'],
    ['a network failure', outcome(null, null, 'network'), 'network'],
    ['a timeout', outcome(null, null, 'timeout'), 'timeout'],
  ])('records %s as an error code, never a message', (_name, o, code) => {
    const result = interpret(o);
    expect(result).toMatchObject({ status: 'error', errorCode: code, tags: null });
    expect(JSON.stringify(result)).not.toMatch(/wrong token|not found/);
  });
});

describe('runPhotos', () => {
  it('prepares and sends each photo, in order, and logs one line per photo', async () => {
    const logs: string[] = [];
    const prepare = jest.fn(async () => PREPARED);
    const send = jest.fn(async (): Promise<SendOutcome> => ({ httpStatus: 200, latencyMs: 1200, body: OK_BODY, failure: null }));
    const results = await runPhotos([photo('a.heic'), photo('b.png')], { prepare, send, log: (line) => logs.push(line) });
    expect(prepare.mock.calls).toEqual([['/photos/a.heic'], ['/photos/b.png']]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(IMAGE);
    expect(results.map((r) => [r.file, r.status, r.tags?.category])).toEqual([
      ['a.heic', 'ok', 'top'],
      ['b.png', 'ok', 'top'],
    ]);
    expect(logs).toEqual(['[1/2] a.heic: 200 top in 1200 ms (768x1024, 1 KB)', '[2/2] b.png: 200 top in 1200 ms (768x1024, 1 KB)']);
  });

  it('records a photo that cannot be prepared as prepare_failed and sends nothing for it', async () => {
    const send = jest.fn(async (): Promise<SendOutcome> => ({ httpStatus: 200, latencyMs: 1, body: OK_BODY, failure: null }));
    const logs: string[] = [];
    const prepare = jest.fn(async (path: string) => {
      if (path.endsWith('bad.heic')) throw new Error('metadata is still present after stripping; not sending this photo');
      return PREPARED;
    });
    const results = await runPhotos([photo('bad.heic'), photo('ok.jpg')], { prepare, send, log: (line) => logs.push(line) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual({
      file: 'bad.heic',
      sha256: photo('bad.heic').sha256,
      prepared: null,
      status: 'error',
      httpStatus: null,
      errorCode: 'prepare_failed',
      latencyMs: null,
      tags: null,
      usage: null,
    });
    expect(logs[0]).toMatch(/not sent, could not prepare it: metadata is still present/);
  });

  it('a dry run prepares everything and sends nothing', async () => {
    const results = await runPhotos([photo('a.heic')], { prepare: async () => PREPARED, log: () => undefined });
    expect(results[0]).toMatchObject({ status: 'ok', httpStatus: null, tags: null, prepared: { width: 768 } });
  });

  it('never has more than `concurrency` requests in flight, and allows at most 2', async () => {
    let inFlight = 0;
    let most = 0;
    const send = async (): Promise<SendOutcome> => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { httpStatus: 200, latencyMs: 5, body: OK_BODY, failure: null };
    };
    const photos = ['a', 'b', 'c', 'd', 'e'].map((name) => photo(`${name}.jpg`));
    const results = await runPhotos(photos, { prepare: async () => PREPARED, send, log: () => undefined }, 2);
    expect(most).toBe(2);
    expect(results.map((r) => r.file)).toEqual(photos.map((p) => p.file));
    most = 0;
    await runPhotos(photos, { prepare: async () => PREPARED, send, log: () => undefined }, 1);
    expect(most).toBe(1);
    await expect(runPhotos(photos, { prepare: async () => PREPARED, send, log: () => undefined }, 3)).rejects.toThrow('concurrency');
  });
});

describe('the token and image data never reach the run file or the log', () => {
  it('even when the server echoes the token and the image back', async () => {
    const echo = async ([, init]: FetchArgs): Promise<Response> => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return response(401, { error: { code: 'unauthorized', message: `bad ${auth} for ${String(init?.body).slice(0, 80)}` } });
    };
    const echoOk = async ([, init]: FetchArgs): Promise<Response> => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return response(200, { ...OK_BODY, debug: auth, image: IMAGE });
    };
    const logs: string[] = [];
    const results = [
      ...(await runPhotos([photo('a.heic')], { prepare: async () => PREPARED, send: sender(echo).send, log: (l) => logs.push(l) })),
      ...(await runPhotos([photo('b.heic')], { prepare: async () => PREPARED, send: sender(echoOk).send, log: (l) => logs.push(l) })),
    ];
    const record = buildRunRecord({
      startedAt: '2026-10-23T10:00:00.000Z',
      finishedAt: '2026-10-23T10:00:05.000Z',
      gitCommit: 'abc',
      gitDirty: false,
      promptHash: '0123456789ab',
      functionUrl: URL,
      concurrency: 1,
      photos: results,
    });
    const text = serializeRunRecord(record, [TOKEN]);
    for (const output of [text, logs.join('\n')]) {
      expect(output).not.toContain(TOKEN);
      expect(output).not.toContain('Bearer');
      expect(output).not.toContain(IMAGE.slice(0, 40));
      expect(output).not.toContain('/9j/');
    }
    expect(parseRunRecord(text).photos.map((p) => p.errorCode)).toEqual(['unauthorized', null]);
  });

  it('serializeRunRecord refuses a record holding the token or image data', () => {
    const base = buildRunRecord({
      startedAt: 's',
      finishedAt: 'f',
      gitCommit: 'abc',
      gitDirty: false,
      promptHash: 'p',
      functionUrl: URL,
      concurrency: 1,
      photos: [],
    });
    expect(() => serializeRunRecord({ ...base, gitCommit: TOKEN }, [TOKEN])).toThrow('contains the token');
    expect(() => serializeRunRecord({ ...base, gitCommit: IMAGE }, [TOKEN])).toThrow('contains image data');
    expect(serializeRunRecord(base, [TOKEN, ''])).toContain('"kind": "spotlight-tagging-eval-run"');
  });
});
