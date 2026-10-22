import { CATEGORIES, PALETTE_IDS, SEASONS } from '@/core';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { CONNECTION_CHECK_IMAGE } from './connection-check';
import {
  STUB_TAG_ITEM_RESPONSE,
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_ITEM_MAX_BODY_BYTES,
  TAG_ITEM_MAX_IMAGE_BASE64_LENGTH,
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

describe('tagItemErrorCode', () => {
  it('reads known codes only', () => {
    expect(tagItemErrorCode({ error: { code: 'unauthorized', message: 'x' } })).toBe('unauthorized');
    expect(tagItemErrorCode({ error: { code: 'nope' } })).toBeNull();
    expect(tagItemErrorCode({ error: 'unauthorized' })).toBeNull();
    expect(tagItemErrorCode(null)).toBeNull();
  });
});
