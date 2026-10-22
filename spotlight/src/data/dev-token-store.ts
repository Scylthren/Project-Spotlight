/**
 * Where the development backend token lives on the device (Gate 2, decision
 * D4). The token is typed or pasted on the Me tab; it is never bundled,
 * committed or logged. Real accounts replace it in Gate 4.
 *
 * Implementations: `SecureStoreDevTokenStore` (Keychain / Keystore through
 * expo-secure-store) and `InMemoryDevTokenStore` (tests).
 */
export interface DevTokenStore {
  /** The saved token, or null when none is saved. */
  get(): Promise<string | null>;
  /** Saves a token already checked by `normalizeDevToken`. */
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** Longest token accepted; a pasted page of text is not a token. */
export const DEV_TOKEN_MAX_LENGTH = 256;
/** Same floor as the function's `MIN_DEV_TOKEN_LENGTH`. */
export const DEV_TOKEN_MIN_LENGTH = 32;

export type DevTokenInput = { ok: true; token: string } | { ok: false; reason: 'empty' | 'too-short' | 'too-long' | 'invalid' };

/**
 * Cleans up a typed or pasted token: trims surrounding spaces and line
 * breaks (pasting often adds one). The token itself must be printable ASCII
 * with no spaces, since it goes into an HTTP header.
 */
export function normalizeDevToken(input: string): DevTokenInput {
  const token = input.trim();
  if (token.length === 0) return { ok: false, reason: 'empty' };
  if (!/^[\x21-\x7E]+$/.test(token)) return { ok: false, reason: 'invalid' };
  if (token.length < DEV_TOKEN_MIN_LENGTH) return { ok: false, reason: 'too-short' };
  if (token.length > DEV_TOKEN_MAX_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, token };
}

export class InMemoryDevTokenStore implements DevTokenStore {
  constructor(private token: string | null = null) {}

  async get(): Promise<string | null> {
    return this.token;
  }

  async set(token: string): Promise<void> {
    this.token = token;
  }

  async clear(): Promise<void> {
    this.token = null;
  }
}
