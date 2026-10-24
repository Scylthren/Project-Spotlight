import { OUTFIT_REQUEST_MAX_LENGTH } from '@/ai/generate-outfits-contract';

import { addRecentRequest, parseRecentRequests, RECENT_REQUEST_MAX_LENGTH, RECENT_REQUESTS_MAX } from './recent-requests';

describe('addRecentRequest', () => {
  it('puts the newest first, normalized', () => {
    expect(addRecentRequest(['for summer'], '  emo \n vibes ')).toEqual(['emo vibes', 'for summer']);
  });

  it('moves a repeat to the top instead of keeping two (ignoring case and spacing)', () => {
    expect(addRecentRequest(['a', 'Emo vibes', 'b'], 'emo  VIBES')).toEqual(['emo VIBES', 'a', 'b']);
  });

  it('keeps the last 5', () => {
    let list: string[] = [];
    for (const text of ['1', '2', '3', '4', '5', '6']) list = addRecentRequest(list, text);
    expect(list).toEqual(['6', '5', '4', '3', '2']);
    expect(RECENT_REQUESTS_MAX).toBe(5);
  });

  it('ignores empty and too-long text', () => {
    expect(addRecentRequest(['a'], '   ')).toEqual(['a']);
    expect(addRecentRequest(['a'], 'x'.repeat(201))).toEqual(['a']);
    expect(addRecentRequest([], '\u{1F600}'.repeat(200))).toHaveLength(1);
  });

  it('keeps the same limit as the request', () => {
    expect(RECENT_REQUEST_MAX_LENGTH).toBe(OUTFIT_REQUEST_MAX_LENGTH);
  });
});

describe('parseRecentRequests', () => {
  it('reads a stored list', () => {
    expect(parseRecentRequests(JSON.stringify(['b', 'a']))).toEqual(['b', 'a']);
  });

  it.each([null, '', 'not json', '{"a":1}', '42'])('gives an empty list for %p', (raw) => {
    expect(parseRecentRequests(raw)).toEqual([]);
  });

  it('drops non-texts, empties, repeats and extras', () => {
    const raw = JSON.stringify(['a', 3, ' ', 'A', 'b', 'c', 'd', 'e', 'f', 'x'.repeat(201)]);
    expect(parseRecentRequests(raw)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
