import { CATEGORIES, FITS, FORMALITIES, ITEM_TYPE_MAX_LENGTH, MATERIALS, PALETTE_IDS, PATTERNS, SEASONS } from '@/core';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { CONNECTION_CHECK_IMAGE } from './connection-check';
import {
  STUB_TAG_ITEM_RESPONSE,
  readTagItemUsage,
  readTagType,
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_PATTERNS,
  TAG_TYPE_MAX_LENGTH,
  TAG_ITEM_MAX_BODY_BYTES,
  TAG_ITEM_MAX_IMAGE_BASE64_LENGTH,
  TAG_ITEM_ERROR_CODES,
  TAG_SEASONS,
  tagItemErrorCode,
  validateTagItemRequest,
  validateTagItemResponse,
} from './tag-item-contract';


describe('tag-item contract drift', () => {
  it('the app copy is byte-identical to supabase/functions/_shared/tag-item-contract.ts', () => {
    const canonical = readText(joinPath(REPO_ROOT, 'supabase/functions/_shared/tag-item-contract.ts'));
    const copy = readText(joinPath(REPO_ROOT, 'spotlight/src/ai/tag-item-contract.ts'));
    // If this fails: edit the supabase file, then copy it over the app file.
    expect(copy).toBe(canonical);
  });

  it('uses the same vocabulary as the app', () => {
    expect([...TAG_CATEGORIES]).toEqual([...CATEGORIES]);
    expect([...TAG_COLORS]).toEqual([...PALETTE_IDS]);
    expect([...TAG_SEASONS]).toEqual([...SEASONS]);
    expect([...TAG_PATTERNS]).toEqual([...PATTERNS]);
    expect([...TAG_MATERIALS]).toEqual([...MATERIALS]);
    expect([...TAG_FITS]).toEqual([...FITS]);
    expect([...TAG_FORMALITIES]).toEqual([...FORMALITIES]);
    expect(TAG_TYPE_MAX_LENGTH).toBe(ITEM_TYPE_MAX_LENGTH);
  });

  it('documents every D6 value in docs/api/tag-item.md', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md'));
    for (const value of [...TAG_PATTERNS, ...TAG_MATERIALS, ...TAG_FITS, ...TAG_FORMALITIES]) {
      expect(doc).toContain(`\`${value}\``);
    }
    for (const field of ['type', 'pattern', 'material', 'fit', 'formality']) expect(doc).toContain(`\`tags.${field}\``);
    expect(doc).toContain(`1 to ${TAG_TYPE_MAX_LENGTH} characters`);
  });

  it('documents every error code in docs/api/tag-item.md', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md'));
    for (const code of TAG_ITEM_ERROR_CODES) expect(doc).toContain(`\`${code}\``);
  });

  it('documents the limits in docs/api/tag-item.md', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md')).replace(/[,_ ]/g, '');
    expect(doc).toContain(String(TAG_ITEM_MAX_BODY_BYTES));
    expect(doc).toContain(String(TAG_ITEM_MAX_IMAGE_BASE64_LENGTH));
  });
});

describe('validateTagItemRequest', () => {
  const image = CONNECTION_CHECK_IMAGE.base64;

  it('accepts a base64 JPEG', () => {
    expect(validateTagItemRequest({ imageBase64: image, contentType: 'image/jpeg' })).toEqual({
      ok: true,
      value: { imageBase64: image, contentType: 'image/jpeg' },
    });
  });

  it('ignores extra fields', () => {
    expect(validateTagItemRequest({ imageBase64: image, contentType: 'image/jpeg', extra: 1 }).ok).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', [image]],
    ['no content type', { imageBase64: image }],
    ['a PNG content type', { imageBase64: image, contentType: 'image/png' }],
    ['no image', { contentType: 'image/jpeg' }],
    ['an empty image', { imageBase64: '', contentType: 'image/jpeg' }],
    ['a number image', { imageBase64: 5, contentType: 'image/jpeg' }],
    ['a data URL', { imageBase64: `data:image/jpeg;base64,${image}`, contentType: 'image/jpeg' }],
    ['base64 with a line break', { imageBase64: `${image.slice(0, 8)}\n${image.slice(8)}`, contentType: 'image/jpeg' }],
    ['base64url', { imageBase64: image.replace(/\+/g, '-').replace(/\//g, '_'), contentType: 'image/jpeg' }],
    ['a bad length', { imageBase64: image.slice(0, -1), contentType: 'image/jpeg' }],
    ['a PNG', { imageBase64: 'iVBORw0KGgo=', contentType: 'image/jpeg' }],
    ['too large', { imageBase64: `/9j/${'A'.repeat(TAG_ITEM_MAX_IMAGE_BASE64_LENGTH)}`, contentType: 'image/jpeg' }],
  ])('rejects %s', (_name, body) => {
    expect(validateTagItemRequest(body).ok).toBe(false);
  });

  it('accepts an image of exactly the maximum length', () => {
    const body = { imageBase64: `/9j/${'A'.repeat(TAG_ITEM_MAX_IMAGE_BASE64_LENGTH - 4)}`, contentType: 'image/jpeg' };
    expect(validateTagItemRequest(body).ok).toBe(true);
  });
});

describe('validateTagItemResponse', () => {
  const valid = () => JSON.parse(JSON.stringify(STUB_TAG_ITEM_RESPONSE));

  it('accepts the stub', () => {
    expect(validateTagItemResponse(valid())).toEqual({ ok: true, value: STUB_TAG_ITEM_RESPONSE });
  });

  it('accepts empty suggestions', () => {
    const body = { apiVersion: 1, stub: false, tags: { category: null, colors: [], seasons: [] } };
    expect(validateTagItemResponse(body).ok).toBe(true);
  });

  it('the stub suggests every D6 field', () => {
    const { type, pattern, material, fit, formality } = STUB_TAG_ITEM_RESPONSE.tags;
    expect([type, pattern, material, fit, formality].every((v) => v !== null)).toBe(true);
  });

  it('reads missing D6 fields (an older server) as no suggestion', () => {
    const body = { apiVersion: 1, stub: false, tags: { category: 'top', colors: ['navy'], seasons: [] } };
    expect(validateTagItemResponse(body)).toEqual({
      ok: true,
      value: {
        apiVersion: 1,
        stub: false,
        tags: { category: 'top', colors: ['navy'], seasons: [], type: null, pattern: null, material: null, fit: null, formality: null },
      },
    });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['an unknown pattern', { pattern: 'paisley' }, 'pattern'],
    ['a label instead of an id', { pattern: 'polka dot' }, 'pattern'],
    ['an unknown material', { material: 'velvet' }, 'material'],
    ['an unknown fit', { fit: 'baggy' }, 'fit'],
    ['an unknown formality', { formality: 'smart casual' }, 'formality'],
    ['a capitalized formality', { formality: 'Casual' }, 'formality'],
    ['a non-string fit', { fit: 3 }, 'fit'],
    ['a type that is too long', { type: 'x'.repeat(31) }, 'type'],
    ['an empty type', { type: '   ' }, 'type'],
    ['a non-string type', { type: ['Hoodie'] }, 'type'],
  ])('drops %s and keeps the rest of the response', (_name, change, field) => {
    const body = valid();
    Object.assign(body.tags, change);
    const result = validateTagItemResponse(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value.tags as unknown as Record<string, unknown>)[field]).toBeNull();
    expect(result.value.tags.category).toBe('top');
    expect(result.value.tags.colors).toEqual(['navy', 'white']);
  });

  it('normalizes a suggested type', () => {
    expect(readTagType('  Band   hoodie ')).toBe('Band hoodie');
    expect(readTagType('x'.repeat(30))).toBe('x'.repeat(30));
    expect(readTagType(`${'é'.repeat(30)}`)).toBe('é'.repeat(30));
    expect(readTagType(null)).toBeNull();
  });

  it('drops unknown fields (forward compatible)', () => {
    const body = valid();
    body.tags.pattern = 'striped';
    body.model = 'x';
    const result = validateTagItemResponse(body);
    expect(result).toEqual({ ok: true, value: STUB_TAG_ITEM_RESPONSE });
  });

  it.each<[string, (body: any) => unknown]>([
    ['not an object', () => 'ok'],
    ['another API version', (b) => ({ ...b, apiVersion: 2 })],
    ['no stub flag', (b) => ({ ...b, stub: undefined })],
    ['no tags', (b) => ({ ...b, tags: undefined })],
    ['an unknown category', (b) => ({ ...b, tags: { ...b.tags, category: 'swimwear' } })],
    ['a missing category', (b) => ({ ...b, tags: { colors: [], seasons: [] } })],
    ['an unknown color', (b) => ({ ...b, tags: { ...b.tags, colors: ['navy', 'chartreuse'] } })],
    ['a duplicated color', (b) => ({ ...b, tags: { ...b.tags, colors: ['navy', 'navy'] } })],
    ['too many colors', (b) => ({ ...b, tags: { ...b.tags, colors: ['navy', 'white', 'red', 'black'] } })],
    ['colors not a list', (b) => ({ ...b, tags: { ...b.tags, colors: 'navy' } })],
    ['an unknown season', (b) => ({ ...b, tags: { ...b.tags, seasons: ['monsoon'] } })],
    ['a duplicated season', (b) => ({ ...b, tags: { ...b.tags, seasons: ['spring', 'spring'] } })],
  ])('rejects %s', (_name, mutate) => {
    expect(validateTagItemResponse(mutate(valid())).ok).toBe(false);
  });
});

describe('usage (Gate 2 slice 4)', () => {
  const usage = { model: 'claude-haiku-5-5', attempts: 2, inputTokens: 3010, outputTokens: 130 };

  it('validateTagItemResponse accepts a body with usage and drops it (the app ignores it)', () => {
    const body = { ...JSON.parse(JSON.stringify(STUB_TAG_ITEM_RESPONSE)), usage };
    expect(validateTagItemResponse(body)).toEqual({ ok: true, value: STUB_TAG_ITEM_RESPONSE });
    expect(validateTagItemResponse({ ...body, usage: 'garbage' })).toEqual({ ok: true, value: STUB_TAG_ITEM_RESPONSE });
  });

  it('readTagItemUsage reads a well-formed usage object', () => {
    expect(readTagItemUsage({ ...STUB_TAG_ITEM_RESPONSE, usage })).toEqual(usage);
    expect(readTagItemUsage({ usage: { ...usage, extra: 1 } })).toEqual(usage);
  });

  it.each<[string, unknown]>([
    ['no body', null],
    ['no usage', STUB_TAG_ITEM_RESPONSE],
    ['usage not an object', { usage: [1] }],
    ['an empty model', { usage: { ...usage, model: '' } }],
    ['a negative token count', { usage: { ...usage, inputTokens: -1 } }],
    ['a fractional count', { usage: { ...usage, outputTokens: 1.5 } }],
    ['a string count', { usage: { ...usage, attempts: '2' } }],
    ['a missing count', { usage: { model: 'm', attempts: 1, inputTokens: 1 } }],
  ])('readTagItemUsage returns null for %s', (_name, body) => {
    expect(readTagItemUsage(body)).toBeNull();
  });

  it('documents usage in docs/api/tag-item.md', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/tag-item.md'));
    for (const field of ['usage', 'usage.model', 'usage.attempts', 'usage.inputTokens', 'usage.outputTokens']) {
      expect(doc).toContain(`\`${field}\``);
    }
  });
});

describe('tagItemErrorCode', () => {
  it('reads known codes only', () => {
    expect(tagItemErrorCode({ error: { code: 'unauthorized', message: 'x' } })).toBe('unauthorized');
    expect(tagItemErrorCode({ error: { code: 'nope' } })).toBeNull();
    expect(tagItemErrorCode({ error: 'unauthorized' })).toBeNull();
    expect(tagItemErrorCode(null)).toBeNull();
  });
});
