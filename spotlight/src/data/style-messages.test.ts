import { OUTFIT_FAILURES } from '@/ai/outfit-generator';

import {
  checkStyleRequest,
  describeStyleFailure,
  LOOKS_REMOVED_VIEW,
  missingPairText,
  NO_LOOKS_VIEW,
  NO_OTHER_LOOKS_TEXT,
  quotedRequest,
  restyleFailureText,
  STYLE_DATA_NOTICE,
  STYLE_EXAMPLES,
  styleRequestCounter,
  styleRequestError,
  type StyleFailure,
} from './style-messages';

const FAILURES: StyleFailure[] = [...OUTFIT_FAILURES, 'closet-unavailable'];

describe('Style screen text', () => {
  it('has the approved notice, word for word', () => {
    expect(STYLE_DATA_NOTICE).toBe(
      "Your request and your pieces' names and tags (not photos) are sent to our server and to Claude (Anthropic) to suggest looks.",
    );
  });

  it('offers the five example requests', () => {
    expect(STYLE_EXAMPLES).toEqual(['For summer', 'Emo vibes', 'First date', 'Job interview', 'Rainy day']);
  });

  it('accepts 1 to 200 characters after trimming, counting emoji as one', () => {
    expect(checkStyleRequest('  emo \n vibes ')).toEqual({ ok: true, request: 'emo vibes' });
    expect(checkStyleRequest('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkStyleRequest('x'.repeat(201))).toEqual({ ok: false, reason: 'too-long' });
    expect(checkStyleRequest('\u{1F600}'.repeat(200)).ok).toBe(true);
  });

  it('counts characters and shows an error only when too long', () => {
    expect(styleRequestCounter(' ab ')).toBe('2/200');
    expect(styleRequestError('')).toBeUndefined();
    expect(styleRequestError('x'.repeat(201))).toBe('Keep it to 200 characters.');
  });

  it('quotes the request for the Results title', () => {
    expect(quotedRequest('Emo vibes')).toBe('“Emo vibes”');
  });
});

describe('failure words', () => {
  it.each(FAILURES)('%s has a title, a body and an action', (failure) => {
    const view = describeStyleFailure(failure, ['top', 'bottom', 'dress']);
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.body.length).toBeGreaterThan(0);
    expect(restyleFailureText(failure)).toMatch(/^Couldn't restyle/);
  });

  it('says what is missing and offers the Add tab when there are not enough pieces', () => {
    expect(describeStyleFailure('not-enough-items', ['top', 'bottom', 'dress'])).toEqual({
      title: 'Not enough pieces',
      body: 'Add a top and a bottom, or a dress, to get looks.',
      action: 'add-piece',
    });
    expect(describeStyleFailure('not-enough-items', ['bottom', 'dress']).body).toBe('Add a bottom, or a dress, to get looks.');
    expect(missingPairText(['top', 'dress'])).toBe('a top');
  });

  it('distinguishes offline, no token, timeout, rejected and server', () => {
    const titles = new Set((['offline', 'no-token', 'timeout', 'rejected', 'server'] as const).map((f) => describeStyleFailure(f).title));
    expect(titles.size).toBe(5);
    expect(describeStyleFailure('offline').action).toBe('retry');
    expect(describeStyleFailure('rejected').action).toBe('edit-request');
    expect(describeStyleFailure('not-configured').action).toBe('none');
  });

  it('has the no-looks and no-other-looks lines', () => {
    expect(NO_LOOKS_VIEW.title).toBe('No looks this time');
    expect(NO_OTHER_LOOKS_TEXT).toBe('No other looks for this request');
    expect(LOOKS_REMOVED_VIEW).toEqual({
      title: 'No looks left',
      body: 'The pieces in these looks were removed from your closet.',
      action: 'edit-request',
    });
  });
});
