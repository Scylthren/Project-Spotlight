/**
 * Token guard: colors and font sizes come from the theme (`src/theme/`), not
 * from literals in screens and components. One definition, read by both
 * `eslint.config.js` (`no-restricted-syntax`) and `token-guard.test.ts`.
 *
 * Plain CommonJS so the ESLint config can `require` it without a TypeScript
 * loader.
 */

/** Files the guard checks, relative to `spotlight/`. */
const TOKEN_GUARD_FILES = ['src/**/*.{js,jsx,ts,tsx}'];

/**
 * Never checked: the theme itself, palette swatch colors (item data, not
 * styling), and tests and test fixtures (colors there are item data too).
 * Test-helper folders are listed one by one so a new folder named `testing`
 * is not exempt by accident.
 */
const TOKEN_GUARD_EXEMPT = [
  'src/theme/**',
  'src/core/palette.ts',
  'src/**/*.test.{ts,tsx}',
  'src/**/*.contract.ts',
  'src/core/testing/**',
];

/**
 * Files exempt from the guard while they still use raw colors or numeric
 * font sizes. Empty since Gate 1.5 slice 5: every screen and component uses
 * theme tokens. Keep it empty; the guard test caps it at 0 and fails if a
 * listed file no longer violates, so the list cannot go stale.
 */
/** @type {string[]} */
const TOKEN_GUARD_ALLOWLIST = [];

/*
 * Known gaps (not caught):
 * - computed font sizes (`fontSize: size * 0.5`, `fontSize: SIZE`): only
 *   literal values are flagged;
 * - hex or rgb text inside longer strings, and named colors outside the
 *   color-valued style keys and props below;
 * - `src/components/animated-icon.module.css`, a web-only CSS file: the guard
 *   only scans JS and TS files.
 */

const RAW_COLOR = 'Use a color token from src/theme (useTheme().colors) instead of a raw color.';
const RAW_FONT_SIZE = 'Use a typography token from src/theme instead of a numeric fontSize.';

const HEX = '/^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/';
const COLOR_FUNCTION = '/^\\s*(?:rgb|hsl)a?\\(/i';

/** Style keys and props that take a color. Named colors are flagged only here. */
const COLOR_KEY =
  '/^(?:color|backgroundColor|borderColor|border(?:Top|Right|Bottom|Left|Start|End|Block|BlockStart|BlockEnd)Color|tintColor|shadowColor|overlayColor|textDecorationColor|textShadowColor|placeholderTextColor|selectionColor|cursorColor)$/';
/** CSS named colors likely to be typed by hand, any case. */
const NAMED_COLOR =
  '/^(?:white|black|transparent|red|green|blue|yellow|orange|purple|pink|brown|gr[ae]y|light-?gr[ae]y|dark-?gr[ae]y|silver|gold|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|beige|ivory|tan|indigo|violet|crimson|coral|salmon|khaki)$/i';

/** `no-restricted-syntax` entries (esquery selectors). */
const TOKEN_GUARD_SELECTORS = [
  { selector: `Literal[value=${HEX}]`, message: RAW_COLOR },
  { selector: `Literal[value=${COLOR_FUNCTION}]`, message: RAW_COLOR },
  { selector: `TemplateElement[value.raw=${HEX}]`, message: RAW_COLOR },
  { selector: `TemplateElement[value.raw=${COLOR_FUNCTION}]`, message: RAW_COLOR },
  {
    selector: `Property:matches([key.name=${COLOR_KEY}], [key.value=${COLOR_KEY}])[value.type="Literal"][value.value=${NAMED_COLOR}]`,
    message: RAW_COLOR,
  },
  {
    selector: `JSXAttribute[name.name=${COLOR_KEY}]:matches([value.value=${NAMED_COLOR}], [value.expression.value=${NAMED_COLOR}])`,
    message: RAW_COLOR,
  },
  {
    selector: 'Property:matches([key.name="fontSize"], [key.value="fontSize"])[value.type="Literal"]',
    message: RAW_FONT_SIZE,
  },
  {
    selector: 'JSXAttribute[name.name="fontSize"]:matches([value.type="Literal"], [value.expression.type="Literal"])',
    message: RAW_FONT_SIZE,
  },
];

module.exports = {
  TOKEN_GUARD_FILES,
  TOKEN_GUARD_EXEMPT,
  TOKEN_GUARD_ALLOWLIST,
  TOKEN_GUARD_SELECTORS,
};
