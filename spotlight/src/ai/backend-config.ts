/**
 * Where the edge functions live. The Supabase project URL comes from
 * `EXPO_PUBLIC_SUPABASE_URL` (spotlight/.env, gitignored; see .env.example).
 * It is public by design: the URL is not a secret. CLAUDE.md allows only
 * the Supabase URL and publishable key as `EXPO_PUBLIC_` variables.
 */

/** Builds `<project>/functions/v1/<name>`, or null when the URL is missing or not https. */
export function functionUrl(supabaseUrl: string | undefined, name: string): string | null {
  if (!supabaseUrl) return null;
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/?#]+$/.test(base)) return null;
  return `${base}/functions/v1/${name}`;
}

/**
 * The tag-item URL for this build. `process.env.EXPO_PUBLIC_SUPABASE_URL` must
 * be read with this exact expression: Expo inlines it at build time.
 */
export function configuredTagItemUrl(): string | null {
  return functionUrl(process.env.EXPO_PUBLIC_SUPABASE_URL, 'tag-item');
}
