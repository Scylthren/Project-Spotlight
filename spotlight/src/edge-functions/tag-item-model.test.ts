/**
 * Tests for the tag-item function's model call (Gate 2 slice 3): the fixed
 * prompt and JSON schema, reading the reply, the one retry, provider errors,
 * time limits and logging. `fetch` is always a fake; nothing leaves Jest.
 */
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  classifyProviderStatus,
} from '../../../supabase/functions/tag-item/claude.ts';
import {
  handleTagItem,
  PROVIDER_ATTEMPT_TIMEOUT_MS,
  PROVIDER_BUDGET_MS,
  PROVIDER_MIN_RETRY_MS,
  type TagItemEnv,
  type TagItemHttpRequest,
} from '../../../supabase/functions/tag-item/handler.ts';
import { readModelReply, readModelTags } from '../../../supabase/functions/tag-item/model-reply.ts';
import {
  buildTagRequestBody,
  MODEL_TAG_KEYS,
  TAG_MAX_TOKENS,
  TAG_MODEL,
  TAG_REPLY_SCHEMA,
  TAG_SYSTEM_PROMPT,
  TAG_USER_TEXT,
} from '../../../supabase/functions/tag-item/prompt.ts';
import {
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_PATTERNS,
  TAG_SEASONS,
  tagItemErrorCode,
  validateTagItemResponse,
  type ItemTags,
} from '../../../supabase/functions/_shared/tag-item-contract.ts';
import { CONNECTION_CHECK_IMAGE } from '@/ai/connection-check';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { fakeResponse, modelReply, VALID_MODEL_TAGS } from './testing/model-fakes';

/** Built at run time so no token- or key-like literal sits in the repo. */
const TOKEN = 'cd'.repeat(32);
const API_KEY = ['test', 'key', 'y'.repeat(24)].join('-');
const IMAGE = CONNECTION_CHECK_IMAGE.base64;

const EMPTY: ItemTags = {
  category: null,
  colors: [],
  seasons: [],
  type: null,
  pattern: null,
  material: null,
  fit: null,
  formality: null,
};

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function req(): TagItemHttpRequest {
  const body = JSON.stringify({ imageBase64: IMAGE, contentType: 'image/jpeg' });
  return { method: 'POST', authorization: `Bearer ${TOKEN}`, contentLength: null, readBody: async () => ({ ok: true, text: body }) };
}

/** A handler env whose fetch answers from `replies` in order (the last one repeats). */
function setup(replies: (Response | Error | (() => Promise<Response>))[], overrides: Partial<TagItemEnv> = {}) {
  const logs: string[] = [];
  let call = 0;
  const fetchMock = jest.fn(async (..._args: FetchArgs): Promise<Response> => {
    const next = replies[Math.min(call++, replies.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  const env: TagItemEnv = {
    devToken: TOKEN,
    anthropicApiKey: API_KEY,
    fetch: fetchMock as unknown as typeof fetch,
    log: (line) => logs.push(line),
    ...overrides,
  };
  return { env, fetchMock, logs, run: () => handleTagItem(req(), env) };
}

function code(body: unknown): string | null {
  return tagItemErrorCode(body);
}

describe('tag-item prompt and request', () => {
  it('uses Claude Haiku 5.5 by its exact alias', () => {
    expect(TAG_MODEL).toBe('claude-haiku-5-5');
  });

  it('names the model and the time limits in docs/api/tag-item.md', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md'));
    expect(doc).toContain(`\`${TAG_MODEL}\``);
    expect(doc).toContain(`${PROVIDER_ATTEMPT_TIMEOUT_MS / 1000} s per call`);
    expect(doc).toContain(`${PROVIDER_BUDGET_MS / 1000} s`);
  });

  it('builds a Messages API body: image then text, structured JSON output, thinking off, effort low, no sampling knobs or prefill', () => {
    const body = buildTagRequestBody(IMAGE);
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: TAG_MAX_TOKENS,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TAG_REPLY_SCHEMA } },
      system: TAG_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } },
            { type: 'text', text: TAG_USER_TEXT },
          ],
        },
      ],
    });
    expect(TAG_MAX_TOKENS).toBeGreaterThanOrEqual(512);
    for (const key of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(key);
  });

  it('constrains every closed field to the contract lists, allows null where the contract does, and requires every key', () => {
    const props = TAG_REPLY_SCHEMA.properties;
    const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: 'string', enum: [...values] }, { type: 'null' }] });
    expect(props.category).toEqual(nullableEnum(TAG_CATEGORIES));
    expect(props.pattern).toEqual(nullableEnum(TAG_PATTERNS));
    expect(props.material).toEqual(nullableEnum(TAG_MATERIALS));
    expect(props.fit).toEqual(nullableEnum(TAG_FITS));
    expect(props.formality).toEqual(nullableEnum(TAG_FORMALITIES));
    expect(props.colors).toEqual({ type: 'array', items: { type: 'string', enum: [...TAG_COLORS] } });
    expect(props.seasons).toEqual({ type: 'array', items: { type: 'string', enum: [...TAG_SEASONS] } });
    expect(props.type).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(Object.keys(props).sort()).toEqual([...MODEL_TAG_KEYS].sort());
    expect([...TAG_REPLY_SCHEMA.required].sort()).toEqual([...MODEL_TAG_KEYS].sort());
    expect(TAG_REPLY_SCHEMA.additionalProperties).toBe(false);
  });

  it('lists every allowed value in the prompt', () => {
    for (const value of [
      ...TAG_CATEGORIES,
      ...TAG_COLORS,
      ...TAG_SEASONS,
      ...TAG_PATTERNS,
      ...TAG_MATERIALS,
      ...TAG_FITS,
      ...TAG_FORMALITIES,
    ]) {
      expect(TAG_SYSTEM_PROMPT).toContain(`"${value}"`);
    }
    expect(TAG_SYSTEM_PROMPT).toContain('at most 30 characters');
  });

  it('says what to do for the edge cases', () => {
    const prompt = TAG_SYSTEM_PROMPT.toLowerCase();
    for (const phrase of ['screenshot', 'pet', 'several garments', 'most prominent', 'being worn', 'very dark', 'blurred', 'swimwear', 'bags']) {
      expect(prompt).toContain(phrase);
    }
  });
});

describe('readModelReply', () => {
  const body = (text: string, stop_reason = 'end_turn', extra: unknown[] = []) => ({
    content: [...extra, { type: 'text', text }],
    stop_reason,
    usage: { input_tokens: 1, output_tokens: 1 },
  });

  it('reads a fully valid reply with no problems', () => {
    expect(readModelReply(body(JSON.stringify(VALID_MODEL_TAGS)))).toEqual({ kind: 'tags', tags: VALID_MODEL_TAGS, problems: [] });
  });

  it('accepts all-null fields (not a clothing photo) as a valid empty answer', () => {
    expect(readModelReply(body(JSON.stringify(EMPTY)))).toEqual({ kind: 'tags', tags: EMPTY, problems: [] });
  });

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'max_tokens'],
    ['pause_turn', 'stop_reason'],
    ['tool_use', 'stop_reason'],
  ])('checks stop_reason first: %s is malformed even with valid JSON', (stop, reason) => {
    expect(readModelReply(body(JSON.stringify(VALID_MODEL_TAGS), stop))).toEqual({ kind: 'malformed', reason });
  });

  it('reads the first text block', () => {
    const reply = readModelReply(body(JSON.stringify(VALID_MODEL_TAGS), 'end_turn', [{ type: 'thinking', thinking: '...' }]));
    expect(reply.kind).toBe('tags');
  });

  it.each([
    ['no content', { stop_reason: 'end_turn', content: [] }, 'no_text'],
    ['not an object', null, 'no_text'],
    ['not JSON', body('Here are the tags: {"category": "top"}'), 'not_json'],
    ['a JSON array', body('[]'), 'not_object'],
    ['a JSON string', body('"top"'), 'not_object'],
  ])('reports %s as malformed', (_name, reply, reason) => {
    expect(readModelReply(reply)).toEqual({ kind: 'malformed', reason });
  });

  it('nulls out-of-list values field by field and reports them', () => {
    const read = readModelTags({
      ...VALID_MODEL_TAGS,
      category: 'swimwear',
      pattern: 'paisley',
      material: 'Cotton',
      fit: 7,
      formality: 'smart casual',
    });
    expect(read.tags).toEqual({ ...VALID_MODEL_TAGS, category: null, pattern: null, material: null, fit: null, formality: null });
    expect(read.problems.sort()).toEqual(['category', 'fit', 'formality', 'material', 'pattern']);
  });

  it('keeps the valid entries of a list and reports the bad ones', () => {
    const read = readModelTags({ ...VALID_MODEL_TAGS, colors: ['navy', 'Navy', 'teal-blue', 'white'], seasons: 'summer' });
    expect(read.tags.colors).toEqual(['navy', 'white']);
    expect(read.tags.seasons).toEqual([]);
    expect(read.problems.sort()).toEqual(['colors', 'seasons']);
  });

  it('drops duplicates and keeps at most three colors without calling it a problem', () => {
    const read = readModelTags({ ...VALID_MODEL_TAGS, colors: ['navy', 'navy', 'white', 'red', 'black'], seasons: ['winter', 'winter'] });
    expect(read.tags.colors).toEqual(['navy', 'white', 'red']);
    expect(read.tags.seasons).toEqual(['winter']);
    expect(read.problems).toEqual([]);
  });

  it('checks the type: trimmed, single spaces, 1 to 30 characters', () => {
    expect(readModelTags({ ...VALID_MODEL_TAGS, type: '  Denim   jacket ' })).toEqual({
      tags: { ...VALID_MODEL_TAGS, type: 'Denim jacket' },
      problems: [],
    });
    for (const type of ['', '   ', 'x'.repeat(31), 42]) {
      const read = readModelTags({ ...VALID_MODEL_TAGS, type });
      expect(read.tags.type).toBeNull();
      expect(read.problems).toEqual(['type']);
    }
    expect(readModelTags({ ...VALID_MODEL_TAGS, type: 'é'.repeat(30) }).problems).toEqual([]);
  });

  it('reports missing and extra keys', () => {
    const { category: _omit, ...rest } = VALID_MODEL_TAGS;
    expect(readModelTags(rest).problems).toEqual(['category']);
    expect(readModelTags(rest).tags.category).toBeNull();
    expect(readModelTags({ ...VALID_MODEL_TAGS, brand: 'X' }).problems).toEqual(['extra keys']);
  });
});

describe('handleTagItem with the model', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls the Messages API with the key, version and JSON headers, and answers stub: false', async () => {
    const { fetchMock, run } = setup([modelReply(VALID_MODEL_TAGS)]);
    const result = await run();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ apiVersion: 1, tags: VALID_MODEL_TAGS, stub: false });
    expect(validateTagItemResponse(JSON.parse(JSON.stringify(result.body))).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'x-api-key': API_KEY, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' });
    expect(ANTHROPIC_VERSION).toBe('2023-06-01');
    expect(JSON.parse(String(init?.body))).toEqual(buildTagRequestBody(IMAGE));
    expect(init?.signal).toBeDefined();
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('fails closed with 500 server_misconfigured when ANTHROPIC_API_KEY is %s, without reading the body or calling out', async (_n, key) => {
    const readBody = jest.fn();
    const { env, fetchMock } = setup([modelReply(VALID_MODEL_TAGS)], { anthropicApiKey: key });
    const result = await handleTagItem({ ...req(), readBody }, env);
    expect(result.status).toBe(500);
    expect(code(result.body)).toBe('server_misconfigured');
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a missing key still gives 401 to a caller without the token', async () => {
    const { env } = setup([], { anthropicApiKey: undefined });
    const result = await handleTagItem({ ...req(), authorization: null }, env);
    expect(result.status).toBe(401);
  });

  it('never calls the model for 401, 405 or 400', async () => {
    const { env, fetchMock } = setup([modelReply(VALID_MODEL_TAGS)]);
    await handleTagItem({ ...req(), authorization: `Bearer ${'ef'.repeat(32)}` }, env);
    await handleTagItem({ ...req(), method: 'GET' }, env);
    await handleTagItem({ ...req(), readBody: async () => ({ ok: true, text: '{}' }) }, env);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs one line per call with model, attempt, status, stop_reason, tokens and latency, and nothing else', async () => {
    let clock = 1_000;
    const { logs, run } = setup(
      [
        async () => {
          clock += 250;
          return modelReply('not json at all', { inputTokens: 1500, outputTokens: 9 });
        },
        async () => {
          clock += 400;
          return modelReply(VALID_MODEL_TAGS, { inputTokens: 1510, outputTokens: 60 });
        },
      ],
      { now: () => clock },
    );
    await run();
    expect(logs).toHaveLength(2);
    expect(JSON.parse(logs[0])).toEqual({
      fn: 'tag-item',
      event: 'provider_call',
      model: 'claude-haiku-5-5',
      attempt: 1,
      status: 200,
      stop_reason: 'end_turn',
      input_tokens: 1500,
      output_tokens: 9,
      latency_ms: 250,
      outcome: 'malformed:not_json',
    });
    expect(JSON.parse(logs[1])).toMatchObject({ attempt: 2, status: 200, input_tokens: 1510, output_tokens: 60, latency_ms: 400, outcome: 'ok' });
    const all = logs.join('\n');
    for (const secret of [API_KEY, TOKEN, IMAGE.slice(0, 40), 'Oxford shirt', 'not json at all']) expect(all).not.toContain(secret);
  });

  it('names invalid fields in the log, never their values', async () => {
    const { logs, run } = setup([modelReply({ ...VALID_MODEL_TAGS, pattern: 'paisley-secret' })]);
    await run();
    expect(JSON.parse(logs[0])).toMatchObject({ outcome: 'partial', problems: ['pattern'] });
    expect(logs.join('\n')).not.toContain('paisley-secret');
  });

  it('retries once on malformed JSON and answers with the second reply', async () => {
    const { fetchMock, run } = setup([modelReply('{"category": "top", '), modelReply(VALID_MODEL_TAGS)]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).toEqual({ apiVersion: 1, tags: VALID_MODEL_TAGS, stub: false });
  });

  it.each(['refusal', 'max_tokens'])('treats stop_reason %s as malformed and retries once', async (stopReason) => {
    const { fetchMock, run } = setup([modelReply(VALID_MODEL_TAGS, { stopReason }), modelReply(VALID_MODEL_TAGS)]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('retries once on an out-of-list field, then answers with what is valid (out-of-list fields null)', async () => {
    const bad = modelReply({ ...VALID_MODEL_TAGS, category: 'swimwear', colors: ['navy', 'gold'] });
    const { fetchMock, run } = setup([bad, modelReply({ ...VALID_MODEL_TAGS, category: 'swimwear', colors: ['navy', 'gold'] })]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ apiVersion: 1, tags: { ...VALID_MODEL_TAGS, category: null, colors: ['navy'] }, stub: false });
  });

  it('does not retry a fully valid reply', async () => {
    const { fetchMock, run } = setup([modelReply(EMPTY)]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.body).toEqual({ apiVersion: 1, tags: EMPTY, stub: false });
  });

  it('keeps the earlier partial reply when the retry is malformed', async () => {
    const { fetchMock, run } = setup([modelReply({ ...VALID_MODEL_TAGS, fit: 'baggy' }), modelReply('nope')]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body).toEqual({ apiVersion: 1, tags: { ...VALID_MODEL_TAGS, fit: null }, stub: false });
  });

  it('answers with no suggestion (every field empty, 200) when both attempts are malformed', async () => {
    const { fetchMock, run } = setup([modelReply(VALID_MODEL_TAGS, { stopReason: 'refusal' }), modelReply('[]')]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ apiVersion: 1, tags: EMPTY, stub: false });
  });

  it('treats a 200 whose body is not JSON as a malformed reply', async () => {
    const { fetchMock, run } = setup([fakeResponse(200, '<html>'), modelReply(VALID_MODEL_TAGS)]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it.each([
    [429, 503, 'upstream_rate_limited'],
    [529, 503, 'upstream_unavailable'],
    [500, 503, 'upstream_unavailable'],
    [502, 503, 'upstream_unavailable'],
    [400, 502, 'upstream_rejected'],
    [401, 502, 'upstream_rejected'],
    [403, 502, 'upstream_rejected'],
    [413, 502, 'upstream_rejected'],
  ])('maps provider status %i to %i %s without retrying or passing on its message', async (status, expected, errorCode) => {
    const echo = `{"type":"error","error":{"message":"bad image ${IMAGE.slice(0, 20)}"}}`;
    const { fetchMock, run } = setup([fakeResponse(status, echo)]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(expected);
    expect(code(result.body)).toBe(errorCode);
    expect(JSON.stringify(result.body)).not.toContain('bad image');
  });

  it('maps a network error to 503 upstream_unavailable without retrying', async () => {
    const { fetchMock, run } = setup([new TypeError('fetch failed')]);
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(503);
    expect(code(result.body)).toBe('upstream_unavailable');
  });

  it('maps a call that runs past its timeout to 504 upstream_timeout and aborts it', async () => {
    let aborted = false;
    const { fetchMock, logs, run } = setup(
      [
        () =>
          new Promise<Response>(() => {
            // Never answers; the abort is observed through the signal below.
          }),
      ],
      { attemptTimeoutMs: 20 },
    );
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    );
    const result = await run();
    expect(result.status).toBe(504);
    expect(code(result.body)).toBe('upstream_timeout');
    expect(aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logs[0])).toMatchObject({ status: 'timeout', outcome: 'timeout' });
  });

  it('times out even if fetch ignores the abort signal', async () => {
    const { run } = setup([() => new Promise<Response>(() => undefined)], { attemptTimeoutMs: 20 });
    expect((await run()).status).toBe(504);
  });

  it('a provider error on the retry keeps the earlier partial reply; with nothing usable it answers the error', async () => {
    const partial = setup([modelReply({ ...VALID_MODEL_TAGS, material: 'tweed' }), fakeResponse(429, '{}')]);
    expect((await partial.run()).body).toEqual({ apiVersion: 1, tags: { ...VALID_MODEL_TAGS, material: null }, stub: false });

    const nothing = setup([modelReply('oops'), fakeResponse(529, '{}')]);
    const result = await nothing.run();
    expect(result.status).toBe(503);
    expect(code(result.body)).toBe('upstream_unavailable');
  });

  it('skips the retry when less than the minimum budget is left', async () => {
    let clock = 0;
    const { fetchMock, run } = setup(
      [
        async () => {
          clock += PROVIDER_BUDGET_MS - PROVIDER_MIN_RETRY_MS + 1;
          return modelReply('broken');
        },
        modelReply(VALID_MODEL_TAGS),
      ],
      { now: () => clock },
    );
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.body).toEqual({ apiVersion: 1, tags: EMPTY, stub: false });
  });

  it('gives the retry only what is left of the budget', async () => {
    jest.useFakeTimers();
    let clock = 0;
    let secondAborted = -1;
    const { fetchMock, run } = setup([], { now: () => clock, budgetMs: 10_000, attemptTimeoutMs: 8_000 });
    fetchMock
      .mockImplementationOnce(async () => {
        clock += 6_000;
        return modelReply('broken');
      })
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              secondAborted = clock;
              reject(new Error('aborted'));
            });
          }),
      );
    const pending = run();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(3_999);
    expect(secondAborted).toBe(-1);
    await jest.advanceTimersByTimeAsync(1);
    expect(secondAborted).toBe(6_000);
    expect((await pending).status).toBe(504);
  });

  it('keeps the defaults inside the app\'s 20 s client timeout', () => {
    expect(PROVIDER_ATTEMPT_TIMEOUT_MS).toBe(8_000);
    expect(PROVIDER_BUDGET_MS).toBe(16_000);
    expect(PROVIDER_BUDGET_MS).toBeLessThan(20_000);
    expect(PROVIDER_MIN_RETRY_MS).toBeLessThan(PROVIDER_ATTEMPT_TIMEOUT_MS);
  });

  it('classifies provider statuses', () => {
    expect(classifyProviderStatus(429)).toBe('rate_limited');
    expect(classifyProviderStatus(529)).toBe('unavailable');
    expect(classifyProviderStatus(503)).toBe('unavailable');
    expect(classifyProviderStatus(404)).toBe('rejected');
  });
});
