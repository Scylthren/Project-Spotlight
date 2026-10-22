/**
 * When the root layout may render (and so hide the splash screen) while
 * fonts load. It opens once the fonts are loaded, failed, or took longer than
 * `FONT_LOAD_TIMEOUT_MS`, so a stuck load never keeps the app behind the
 * splash. On failure or timeout text falls back to the system fonts.
 */
export const FONT_LOAD_TIMEOUT_MS = 4000;

export interface FontGateState {
  loaded: boolean;
  error: Error | null;
  timedOut: boolean;
}

export function isFontGateOpen({ loaded, error, timedOut }: FontGateState): boolean {
  return loaded || error !== null || timedOut;
}
