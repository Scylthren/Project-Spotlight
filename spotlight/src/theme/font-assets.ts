import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { BodoniModa_400Regular } from '@expo-google-fonts/bodoni-moda/400Regular';
import { BodoniModa_400Regular_Italic } from '@expo-google-fonts/bodoni-moda/400Regular_Italic';
import { BodoniModa_600SemiBold } from '@expo-google-fonts/bodoni-moda/600SemiBold';
import { BodoniModa_700Bold } from '@expo-google-fonts/bodoni-moda/700Bold';
import { BodoniModa_700Bold_Italic } from '@expo-google-fonts/bodoni-moda/700Bold_Italic';

import type { FontFamily } from './typography';

/**
 * The font files to register, keyed by the family names in `fonts`.
 * Per-weight imports so only these faces are bundled, not the whole family.
 */
export const FONT_ASSETS: Record<FontFamily, number> = {
  BodoniModa_400Regular,
  BodoniModa_400Regular_Italic,
  BodoniModa_600SemiBold,
  BodoniModa_700Bold,
  BodoniModa_700Bold_Italic,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
};
