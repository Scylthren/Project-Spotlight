import jpeg from 'jpeg-js';

import { headerMarkers } from '@/core/testing/jpeg-fixtures';
import { fromBase64 } from '@/security/testing/node-files';

import { functionUrl } from './backend-config';
import { FakeClosetTagger, MockClosetTagger, TAG_FAILURES } from './closet-tagger';
import { checkConnection, CONNECTION_CHECK_IMAGE, connectionStatusMessage } from './connection-check';
import { STUB_TAG_ITEM_RESPONSE, validateTagItemRequest } from './tag-item-contract';

describe('MockClosetTagger', () => {
  it('suggests the stub tags, as a fresh copy each time', async () => {
    const tagger = new MockClosetTagger();
    const first = await tagger.tag();
    expect(first).toEqual({ ok: true, tags: STUB_TAG_ITEM_RESPONSE.tags, stub: true });
    if (first.ok) first.tags.colors.push('red');
    expect(await tagger.tag()).toEqual({ ok: true, tags: STUB_TAG_ITEM_RESPONSE.tags, stub: true });
    expect(STUB_TAG_ITEM_RESPONSE.tags.colors).toEqual(['navy', 'white']);
  });
});

describe('FakeClosetTagger', () => {
  it('returns queued outcomes in order, then the fallback, and records inputs', async () => {
    const tagger = new FakeClosetTagger();
    tagger.queue.push({ ok: false, failure: 'unauthorized' }, async () => ({ ok: false, failure: 'timeout' }));
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'unauthorized' });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'timeout' });
    expect(await tagger.tag(CONNECTION_CHECK_IMAGE)).toEqual({ ok: false, failure: 'offline' });
    expect(tagger.inputs).toHaveLength(3);
  });
});

describe('connection check', () => {
  it('sends a real, valid, metadata-free JPEG', () => {
    expect(validateTagItemRequest({ imageBase64: CONNECTION_CHECK_IMAGE.base64, contentType: 'image/jpeg' }).ok).toBe(true);
    const bytes = fromBase64(CONNECTION_CHECK_IMAGE.base64);
    const image = jpeg.decode(bytes, { useTArray: true });
    expect([image.width, image.height]).toEqual([8, 8]);
    // JFIF header, tables, frame, scan: no APP1 (Exif / XMP) or other metadata segment.
    expect(headerMarkers(bytes)).not.toContain(0xe1);
    expect(headerMarkers(bytes).filter((m) => m >= 0xe1 && m <= 0xef)).toEqual([]);
  });

  it('reports ok or the failure, and never rejects', async () => {
    const tagger = new FakeClosetTagger();
    tagger.queue.push({ ok: true, tags: STUB_TAG_ITEM_RESPONSE.tags, stub: true }, { ok: false, failure: 'unauthorized' });
    expect(await checkConnection(tagger)).toBe('ok');
    expect(await checkConnection(tagger)).toBe('unauthorized');
    expect(tagger.inputs[0]).toBe(CONNECTION_CHECK_IMAGE);
    const throwing = { tag: async () => Promise.reject(new Error('bug')) };
    expect(await checkConnection(throwing)).toBe('server');
  });

  it('has a distinct message for every status', () => {
    const messages = ['ok' as const, ...TAG_FAILURES].map(connectionStatusMessage);
    expect(messages.every((m) => m.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(messages.length);
    expect(connectionStatusMessage('unauthorized')).toMatch(/wrong token/i);
    expect(connectionStatusMessage('offline')).toMatch(/offline/i);
    expect(connectionStatusMessage('timeout')).toMatch(/timed out/i);
  });
});

describe('functionUrl', () => {
  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co/functions/v1/tag-item'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co/functions/v1/tag-item'],
    [' https://abc.supabase.co// ', 'https://abc.supabase.co/functions/v1/tag-item'],
    ['https://localhost:54321', 'https://localhost:54321/functions/v1/tag-item'],
  ])('builds the URL from %j', (base, expected) => {
    expect(functionUrl(base, 'tag-item')).toBe(expected);
  });

  it.each([undefined, '', 'http://abc.supabase.co', 'abc.supabase.co', 'https://abc.supabase.co/rest/v1', 'https://a b.co'])(
    'refuses %j',
    (base) => {
      expect(functionUrl(base, 'tag-item')).toBeNull();
    },
  );
});
