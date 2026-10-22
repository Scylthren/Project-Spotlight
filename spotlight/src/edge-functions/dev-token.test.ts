import {
  bearerToken,
  checkDevToken,
  constantTimeEqual,
  MIN_DEV_TOKEN_LENGTH,
} from '../../../supabase/functions/_shared/dev-token.ts';
import { DEV_TOKEN_MIN_LENGTH } from '@/data/dev-token-store';

const TOKEN = '0f'.repeat(32);

describe('bearerToken', () => {
  it.each([
    [`Bearer ${TOKEN}`, TOKEN],
    [`bearer ${TOKEN}`, TOKEN],
    [`BEARER   ${TOKEN}  `, TOKEN],
  ])('reads %j', (header, expected) => {
    expect(bearerToken(header)).toBe(expected);
  });

  it.each([null, undefined, '', 'Bearer', 'Bearer ', `Basic ${TOKEN}`, `Bearer ${TOKEN} extra`, `Token ${TOKEN}`, TOKEN])(
    'rejects %j',
    (header) => {
      expect(bearerToken(header)).toBeNull();
    },
  );
});

describe('constantTimeEqual', () => {
  it('is true only for identical strings', () => {
    expect(constantTimeEqual(TOKEN, TOKEN)).toBe(true);
    expect(constantTimeEqual(TOKEN, `${TOKEN.slice(0, -1)}e`)).toBe(false);
    expect(constantTimeEqual(TOKEN, TOKEN.slice(0, -1))).toBe(false);
    expect(constantTimeEqual('', TOKEN)).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('é', 'e')).toBe(false);
  });
});

describe('checkDevToken', () => {
  it('accepts the configured token and ignores whitespace around the secret', () => {
    expect(checkDevToken(`Bearer ${TOKEN}`, TOKEN)).toBe('ok');
    expect(checkDevToken(`Bearer ${TOKEN}`, `${TOKEN}\n`)).toBe('ok');
  });

  it('rejects a missing or wrong token', () => {
    expect(checkDevToken(null, TOKEN)).toBe('unauthorized');
    expect(checkDevToken(`Bearer ${'1'.repeat(64)}`, TOKEN)).toBe('unauthorized');
  });

  it('never authorizes when the secret is missing or too short, even if the header matches', () => {
    expect(checkDevToken(`Bearer ${TOKEN}`, undefined)).toBe('misconfigured');
    expect(checkDevToken(`Bearer ${TOKEN}`, '')).toBe('misconfigured');
    const short = 'a'.repeat(MIN_DEV_TOKEN_LENGTH - 1);
    expect(checkDevToken(`Bearer ${short}`, short)).toBe('misconfigured');
  });

  it('says unauthorized, not misconfigured, for a missing or malformed header', () => {
    for (const secret of [undefined, '', 'short']) {
      for (const header of [null, undefined, '', 'Bearer ', `Basic ${TOKEN}`, TOKEN]) {
        expect(checkDevToken(header, secret)).toBe('unauthorized');
      }
    }
  });

  it('uses the same minimum length as the app', () => {
    expect(DEV_TOKEN_MIN_LENGTH).toBe(MIN_DEV_TOKEN_LENGTH);
  });
});
