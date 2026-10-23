/**
 * Finds secrets that must never be in the repo or the app bundle: an
 * Anthropic API key, a Supabase secret or service-role key, and a 64-hex
 * token (the shape of the dev token, `openssl rand -hex 32`).
 *
 * Plain TypeScript; `secret-scan.test.ts` runs it over every file git would
 * commit in the repo. The patterns are assembled from
 * fragments so this file does not match itself.
 */

export type SecretKind = 'anthropic-key' | 'supabase-secret-key' | 'service-role-jwt' | 'hex-token';

export interface SecretFinding {
  kind: SecretKind;
  /** 1-based line of the match. */
  line: number;
}

const ANTHROPIC_PREFIX = ['sk', 'ant', ''].join('-');
const SUPABASE_SECRET_PREFIX = ['sb', 'secret', ''].join('_');
const SERVICE_ROLE = ['service', 'role'].join('_');

const PREFIXES: { kind: SecretKind; prefix: string }[] = [
  { kind: 'anthropic-key', prefix: ANTHROPIC_PREFIX },
  { kind: 'supabase-secret-key', prefix: SUPABASE_SECRET_PREFIX },
];

/** 64 hex digits not inside a longer run of hex digits. */
const HEX_TOKEN = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{64}(?![0-9A-Fa-f])/g;
/** header.payload.signature, both JSON parts base64url starting with `{"`. */
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;

/** Decodes base64url without Buffer or atob (works in any JS runtime). */
export function decodeBase64Url(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of input) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

function isServiceRoleJwt(payload: string): boolean {
  try {
    const claims: unknown = JSON.parse(decodeBase64Url(payload));
    return typeof claims === 'object' && claims !== null && (claims as { role?: unknown }).role === SERVICE_ROLE;
  } catch {
    // Not valid JSON: still flag it if the role is visible in the raw text.
    return decodeBase64Url(payload).includes(SERVICE_ROLE);
  }
}

/** Every secret-shaped string in `text`, with its line. Never returns the secret itself. */
export function scanText(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lineAt = (index: number) => text.slice(0, index).split('\n').length;

  for (const { kind, prefix } of PREFIXES) {
    for (let at = text.indexOf(prefix); at >= 0; at = text.indexOf(prefix, at + 1)) {
      findings.push({ kind, line: lineAt(at) });
    }
  }
  for (const match of text.matchAll(HEX_TOKEN)) {
    findings.push({ kind: 'hex-token', line: lineAt(match.index ?? 0) });
  }
  for (const match of text.matchAll(JWT)) {
    if (isServiceRoleJwt(match[1])) findings.push({ kind: 'service-role-jwt', line: lineAt(match.index ?? 0) });
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** Names allowed to carry the `EXPO_PUBLIC_` prefix (CLAUDE.md, Security). */
export const ALLOWED_PUBLIC_ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;

/** `EXPO_PUBLIC_*` names in `text` that are not allowed. */
export function disallowedPublicEnvNames(text: string): string[] {
  const names = new Set(text.match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? []);
  return [...names].filter((name) => !(ALLOWED_PUBLIC_ENV as readonly string[]).includes(name)).sort();
}
