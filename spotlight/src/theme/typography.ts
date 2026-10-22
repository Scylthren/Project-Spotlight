import type { TextStyle } from 'react-native';

/**
 * Font family names. Each weight and style is its own family on native, so
 * text picks a face by family name, never by `fontWeight`. The names are the
 * keys `FONT_ASSETS` (font-assets.ts) registers with expo-font.
 * Bodoni Moda: display text (titles, item names, prompts, style tags).
 * Archivo: UI text.
 */
export const fonts = {
  serif: {
    regular: 'BodoniModa_400Regular',
    italic: 'BodoniModa_400Regular_Italic',
    semiBold: 'BodoniModa_600SemiBold',
    bold: 'BodoniModa_700Bold',
    boldItalic: 'BodoniModa_700Bold_Italic',
  },
  sans: {
    regular: 'Archivo_400Regular',
    medium: 'Archivo_500Medium',
    semiBold: 'Archivo_600SemiBold',
    bold: 'Archivo_700Bold',
  },
} as const;

type Fonts = typeof fonts;
export type FontFamily = { [G in keyof Fonts]: Fonts[G][keyof Fonts[G]] }[keyof Fonts];

/** Every family in `fonts`, for loading and tests. */
export const FONT_FAMILIES: readonly FontFamily[] = [
  ...Object.values(fonts.serif),
  ...Object.values(fonts.sans),
];

/** Converts a CSS letter spacing in em to points at a font size, rounded to 0.01 pt. */
export function emToPt(fontSize: number, em: number): number {
  return Math.round(fontSize * em * 100) / 100;
}

export interface TextVariant {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: TextStyle['textTransform'];
}

/**
 * Letter spacing as the mockup writes it: `{ em }` (labels, buttons) is
 * converted per size; `{ pt }` (titles, written in px, and px = pt) is used
 * as is.
 */
type Tracking = { em: number } | { pt: number };

function variant(
  fontFamily: FontFamily,
  fontSize: number,
  lineHeight: number,
  tracking: Tracking = { pt: 0 },
  textTransform?: TextStyle['textTransform'],
): TextVariant {
  return {
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing: 'em' in tracking ? emToPt(fontSize, tracking.em) : tracking.pt,
    ...(textTransform ? { textTransform } : {}),
  };
}

/**
 * Bodoni Moda sets a deep descent (0.4 em) and capitals 0.75 em tall, so a
 * line box of 1.0-1.05 em clips the tops of capitals on device. Serif lines
 * get at least 1.2 em; the mockups' tighter CSS line heights don't carry over.
 * Accents above capitals reach 1.05 em and can still clip at 1.2 em.
 */
export const SERIF_MIN_LINE_HEIGHT = 1.2;

const serifLine = (fontSize: number) => Math.ceil(fontSize * SERIF_MIN_LINE_HEIGHT);

/**
 * The type scale in points. Sizes, line heights and tracking come from the
 * mockups (390 pt wide, so CSS px = pt). Titles track in px; uppercase UI
 * labels track in em, converted per size.
 */
export const typography = {
  /** Screen titles in the masthead ("Closet", "Me"): 48px, -1px. */
  display: variant(fonts.serif.bold, 48, serifLine(48), { pt: -1 }),
  /** Smaller screen titles (Today.dc.html "Look of the day"): 40px, -1px. */
  title: variant(fonts.serif.bold, 40, serifLine(40), { pt: -1 }),
  /** Step headers and the item name on the detail screen: 32px, -0.5px. */
  headline: variant(fonts.serif.regular, 32, serifLine(32), { pt: -0.5 }),
  /** Item names in forms and headers. */
  itemName: variant(fonts.serif.regular, 28, serifLine(28)),
  /** Item names under closet tiles. */
  itemNameSmall: variant(fonts.serif.regular, 17, serifLine(17)),
  /** Large text inputs on an underline (SaveItem.dc.html item name): 20px serif. */
  inputSerif: variant(fonts.serif.regular, 20, serifLine(20)),
  /** Style tags and italic asides. */
  styleTag: variant(fonts.serif.italic, 14, 18),
  bodyLarge: variant(fonts.sans.regular, 15, 22),
  body: variant(fonts.sans.regular, 14, 20),
  bodySmall: variant(fonts.sans.regular, 13, 19),
  caption: variant(fonts.sans.regular, 12, 16),
  /** Section labels: 11 pt uppercase, 0.18em. */
  label: variant(fonts.sans.bold, 11, 14, { em: 0.18 }, 'uppercase'),
  /** The centered label of a step header (Angles.dc.html "New piece"): 11 pt semibold, 0.2em. */
  headerLabel: variant(fonts.sans.semiBold, 11, 14, { em: 0.2 }, 'uppercase'),
  /** Tab bar labels: 0.14em. */
  tabLabel: variant(fonts.sans.semiBold, 11, 14, { em: 0.14 }, 'uppercase'),
  /** Filter chips and small uppercase actions: 0.12em. */
  chip: variant(fonts.sans.semiBold, 12, 16, { em: 0.12 }, 'uppercase'),
  /** Sentence-case chips (SaveItem.dc.html seasons, "+ Add"): 13 pt, no tracking. */
  chipSentence: variant(fonts.sans.regular, 13, 16),
  /** Button text: 0.16em. */
  button: variant(fonts.sans.semiBold, 13, 16, { em: 0.16 }, 'uppercase'),
  /** Segmented control options (Profile.dc.html Appearance): 13 pt semibold, sentence case. */
  segment: variant(fonts.sans.semiBold, 13, 16),
} as const satisfies Record<string, TextVariant>;

export type TypographyVariant = keyof typeof typography;
