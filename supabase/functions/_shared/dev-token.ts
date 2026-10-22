/**
 * The development-only token that protects the functions until real accounts
 * exist (Gate 4). The expected value is the `DEV_TOKEN` function secret.
 *
 * Plain TypeScript with no imports (runs in Deno and Jest). Never log the
 * token, the header, or the comparison result details.
 */

/** Returns the token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Compares two strings in time that depends only on their lengths, not on
 * where they first differ. A length mismatch is still a mismatch.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export type DevTokenCheck = 'ok' | 'unauthorized' | 'misconfigured';

/** `openssl rand -hex 32` gives 64 characters; anything under 32 is refused as a secret. */
export const MIN_DEV_TOKEN_LENGTH = 32;

/**
 * Checks a request's Authorization header against the configured token.
 * A missing or malformed header is `unauthorized` whatever the server state
 * (so anonymous callers learn nothing about the configuration). A
 * well-formed bearer token with no usable secret (unset or too short) is
 * `misconfigured`: it never authorizes anything.
 */
export function checkDevToken(authorization: string | null | undefined, expected: string | undefined): DevTokenCheck {
  const given = bearerToken(authorization);
  if (given === null) return 'unauthorized';
  if (!expected || expected.trim().length < MIN_DEV_TOKEN_LENGTH) return 'misconfigured';
  return constantTimeEqual(given, expected.trim()) ? 'ok' : 'unauthorized';
}
