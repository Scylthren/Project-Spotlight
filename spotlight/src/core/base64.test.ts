import { encodeBase64 } from './base64';

/** Reference encoder: the platform's btoa over a binary string. */
function reference(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('encodeBase64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes the RFC 4648 vector %p', (text, expected) => {
    expect(encodeBase64(new TextEncoder().encode(text))).toBe(expected);
  });

  it('matches btoa for every byte value and for lengths around the chunk size', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(encodeBase64(all)).toBe(reference(all));
    for (const length of [6143, 6144, 6145, 6146, 20_000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7919) & 0xff);
      expect(encodeBase64(bytes)).toBe(reference(bytes));
    }
  });
});
