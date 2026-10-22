import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

import { FONT_ASSETS } from '@/theme/font-assets';
import { FONT_LOAD_TIMEOUT_MS, isFontGateOpen } from '@/theme/font-gate';

/**
 * Loads the app fonts. Returns true once the app may render: fonts loaded,
 * failed, or timed out (rules in `theme/font-gate.ts`).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_ASSETS);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (error) console.warn('Fonts failed to load; using system fonts.', error);
  }, [error]);

  return isFontGateOpen({ loaded, error, timedOut });
}
