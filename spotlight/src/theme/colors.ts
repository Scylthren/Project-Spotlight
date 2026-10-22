/**
 * Color tokens for the light and dark themes. Source: `docs/design/README.md`
 * ("Light colors", "Dark colors") and the theme table in
 * `docs/design/mockups/Profile.dc.html`.
 *
 * Item colors (palette swatches) are data, not tokens: they live in
 * `src/core/palette.ts`.
 */

export interface ThemeColors {
  /** Ink: body text, rules, primary button fill. */
  text: string;
  /** Paper: the screen background. */
  background: string;
  /** Cards and inset panels. */
  surface: string;
  /** Behind photos and cutouts. */
  photoBackground: string;
  /** A second photo background, to tell neighbouring tiles apart. */
  photoBackgroundAlt: string;
  /** 1 pt dividers between rows and sections. */
  hairline: string;
  /** Outlines of inputs, unselected chips and swatches. */
  border: string;
  /** Labels, metadata, placeholders. */
  textSecondary: string;
  /** Secondary body copy (longer text), darker than `textSecondary`. */
  textBodySecondary: string;
  /** The single red accent: active tab, the Style action, highlights. */
  accent: string;
  /** Destructive actions and error messages. */
  danger: string;
}

export type ColorName = keyof ThemeColors;

export const lightColors: ThemeColors = {
  text: '#0E0E0E',
  background: '#FFFFFF',
  surface: '#EDEBE7',
  photoBackground: '#EDEBE7',
  photoBackgroundAlt: '#E4E1DB',
  hairline: '#E2DFD8',
  border: '#B9B6AF',
  textSecondary: '#5E5C58',
  textBodySecondary: '#4A4945',
  accent: '#C8102E',
  danger: '#C8102E',
};

export const darkColors: ThemeColors = {
  text: '#F2F0EB',
  background: '#0B0B0B',
  surface: '#1C1B19',
  // Approved 2026-10-21 (README gap): same as `surface`, as in light (photo background = card).
  photoBackground: '#1C1B19',
  // Approved 2026-10-21 (README gap): one step lighter than `photoBackground` (1.09:1, light is 1.10:1).
  photoBackgroundAlt: '#24231F',
  hairline: '#33322F',
  // Approved 2026-10-21 (README gap): 3.09:1 on the background, between hairline and secondary text.
  border: '#615F5A',
  textSecondary: '#A3A19A',
  // Approved 2026-10-21 (README gap): between text and secondary text (11.64:1 on the background).
  textBodySecondary: '#C9C7C0',
  accent: '#FF5A6E',
  // Approved 2026-10-21 (README gap): the `danger` value from Profile.dc.html (7.85:1 on the background).
  danger: '#FF7A86',
};
