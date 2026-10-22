import { DEV_TOKEN_MAX_LENGTH, DEV_TOKEN_MIN_LENGTH, InMemoryDevTokenStore, normalizeDevToken } from './dev-token-store';

const TOKEN = 'c3'.repeat(32);

describe('normalizeDevToken', () => {
  it('trims spaces and line breaks a paste adds', () => {
    expect(normalizeDevToken(`  ${TOKEN}\n`)).toEqual({ ok: true, token: TOKEN });
    expect(normalizeDevToken(`\t${TOKEN}\r\n`)).toEqual({ ok: true, token: TOKEN });
  });

  it.each([
    ['', 'empty'],
    ['   \n', 'empty'],
    [`${TOKEN.slice(0, 20)} ${TOKEN.slice(20)}`, 'invalid'],
    [`${TOKEN}é`, 'invalid'],
    [`${TOKEN}​`, 'invalid'],
    ['a'.repeat(DEV_TOKEN_MIN_LENGTH - 1), 'too-short'],
    ['a'.repeat(DEV_TOKEN_MAX_LENGTH + 1), 'too-long'],
  ])('rejects %j as %s', (input, reason) => {
    expect(normalizeDevToken(input)).toEqual({ ok: false, reason });
  });

  it('accepts the length limits exactly', () => {
    expect(normalizeDevToken('a'.repeat(DEV_TOKEN_MIN_LENGTH)).ok).toBe(true);
    expect(normalizeDevToken('a'.repeat(DEV_TOKEN_MAX_LENGTH)).ok).toBe(true);
  });
});

describe('InMemoryDevTokenStore', () => {
  it('saves, reads and clears', async () => {
    const store = new InMemoryDevTokenStore();
    expect(await store.get()).toBeNull();
    await store.set(TOKEN);
    expect(await store.get()).toBe(TOKEN);
    await store.clear();
    expect(await store.get()).toBeNull();
  });
});
