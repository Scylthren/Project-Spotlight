export type ColorScheme = 'light' | 'dark';

/**
 * Maps what the platform reports (`'light'`, `'dark'`, `'unspecified'`,
 * null or undefined) to a theme. Anything but dark is light.
 */
export function resolveColorScheme(reported: string | null | undefined): ColorScheme {
  return reported === 'dark' ? 'dark' : 'light';
}
