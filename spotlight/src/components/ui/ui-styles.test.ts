import { contrastRatio, darkColors, lightColors, themes, type Theme } from '@/theme';

import { BUTTON_VARIANTS, buttonAccessibility, buttonLook } from './button-style';
import { CHIP_VARIANTS, chipAccessibility, chipLook, chipText } from './chip-style';
import { CONTROL_STATES } from './control-state';
import { SCREEN_HEADER_VARIANTS, screenHeaderAccessibility, screenHeaderLook, stepAccessibilityLabel, stepText } from './screen-header-style';
import { SECTION_LABEL_ACCESSIBILITY, sectionLabelLook } from './section-label-style';
import { segmentAccessibility, segmentedGroupAccessibility, segmentedGroupLook, segmentLook } from './segmented-control-style';
import { swatchAccessibility, swatchLook } from './swatch-style';
import { TEXT_FIELD_VARIANTS, textFieldAccessibility, textFieldLook } from './text-field-style';
import { touchArea } from './touch-target';

const THEMES: [string, Theme][] = [
  ['light', themes.light],
  ['dark', themes.dark],
];
const TEXT = 4.5;
const BOUNDARY = 3;
const MIN = 44;

/** Every color a style uses must be one of the theme's tokens. */
function expectTokenColors(theme: Theme, style: object) {
  const tokens = Object.values(theme.colors);
  for (const [key, value] of Object.entries(style)) {
    if (/color$/i.test(key) && value !== undefined) expect([key, tokens.includes(value)]).toEqual([key, true]);
  }
}

/** Drawn height plus hit slop. */
const reach = (minHeight: unknown, slop?: { top: number; bottom: number; left: number; right: number }) =>
  touchArea({ height: Number(minHeight), width: MIN }, slop).height;

describe('inputBorder token (approved carry-in)', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('%s: meets 3:1 on the background and the surface, and sits between border and secondary text', (_n, c) => {
    expect(contrastRatio(c.inputBorder, c.background)).toBeGreaterThanOrEqual(BOUNDARY);
    expect(contrastRatio(c.inputBorder, c.surface)).toBeGreaterThanOrEqual(BOUNDARY);
    expect(contrastRatio(c.border, c.background)).toBeLessThan(contrastRatio(c.inputBorder, c.background));
    expect(contrastRatio(c.inputBorder, c.background)).toBeLessThan(contrastRatio(c.textSecondary, c.background));
  });

  it('records the measured ratios on the background', () => {
    const r = (fg: string, bg: string) => Math.round(contrastRatio(fg, bg) * 100) / 100;
    expect(r(lightColors.inputBorder, lightColors.background)).toBe(3.68);
    expect(r(darkColors.inputBorder, darkColors.background)).toBe(3.59);
  });
});

describe.each(THEMES)('%s theme', (_name, theme) => {
  const { colors } = theme;

  describe('Button', () => {
    it.each(BUTTON_VARIANTS)('%s resolves in every state with readable text and a 44 pt target', (variant) => {
      for (const state of CONTROL_STATES) {
        const look = buttonLook(theme, variant, state);
        expectTokenColors(theme, look.container);
        expectTokenColors(theme, look.label);
        expect(contrastRatio(String(look.label.color), look.fill)).toBeGreaterThanOrEqual(TEXT);
        expect(reach(look.container.minHeight, look.hitSlop)).toBeGreaterThanOrEqual(MIN);
        expect(look.container.opacity).toBe(state.disabled ? theme.opacity.disabled : 1);
        if (look.boundary) expect(contrastRatio(look.boundary, colors.background)).toBeGreaterThanOrEqual(BOUNDARY);
      }
    });

    it('primary and outline are 52 pt; pressed changes the fill, disabled does not', () => {
      expect(buttonLook(theme, 'primary', { pressed: false, disabled: false }).container.minHeight).toBe(52);
      expect(buttonLook(theme, 'outline', { pressed: false, disabled: false }).boundary).toBe(colors.text);
      expect(buttonLook(theme, 'primary', { pressed: true, disabled: false }).fill).not.toBe(colors.text);
      expect(buttonLook(theme, 'primary', { pressed: true, disabled: true }).fill).toBe(colors.text);
    });
  });

  describe('Chip', () => {
    it.each(CHIP_VARIANTS)('%s resolves in every state with readable text and a 44 pt target', (variant) => {
      for (const selected of [false, true]) {
        for (const state of CONTROL_STATES) {
          const look = chipLook(theme, variant, { ...state, selected });
          expectTokenColors(theme, look.container);
          expectTokenColors(theme, look.label);
          expect(contrastRatio(String(look.label.color), look.fill)).toBeGreaterThanOrEqual(TEXT);
          expect(reach(look.container.minHeight, look.hitSlop)).toBeGreaterThanOrEqual(MIN);
          if (look.boundary) expect(contrastRatio(look.boundary, colors.background)).toBeGreaterThanOrEqual(BOUNDARY);
        }
      }
    });

    it('draws 36 pt chips; selected ones are ink-filled; the add chip is dashed and never selected', () => {
      const idle = { pressed: false, disabled: false };
      expect(chipLook(theme, 'plain', { ...idle, selected: false }).container.minHeight).toBe(36);
      expect(chipLook(theme, 'plain', { ...idle, selected: true }).fill).toBe(colors.text);
      expect(chipLook(theme, 'styleTag', { ...idle, selected: false }).label.fontFamily).toBe(theme.fonts.serif.italic);
      const add = chipLook(theme, 'add', { ...idle, selected: true });
      expect(add.container.borderStyle).toBe('dashed');
      expect(add.fill).toBe(colors.background);
      expect(add.boundary).toBe(colors.text);
    });
  });

  describe('SegmentedControl', () => {
    it('resolves every option state with readable text and a 44 pt height', () => {
      expectTokenColors(theme, segmentedGroupLook(theme));
      expect(contrastRatio(String(segmentedGroupLook(theme).borderColor), colors.background)).toBeGreaterThanOrEqual(BOUNDARY);
      for (const selected of [false, true]) {
        for (const state of CONTROL_STATES) {
          const look = segmentLook(theme, { ...state, selected, index: 1 });
          expectTokenColors(theme, look.container);
          expect(contrastRatio(String(look.label.color), look.fill)).toBeGreaterThanOrEqual(TEXT);
          expect(look.container.minHeight).toBeGreaterThanOrEqual(MIN);
        }
      }
      expect(segmentLook(theme, { selected: true, index: 0, pressed: false, disabled: false }).fill).toBe(colors.text);
      expect(segmentLook(theme, { selected: false, index: 0, pressed: false, disabled: false }).container.borderLeftWidth).toBe(0);
    });
  });

  describe('TextField', () => {
    it.each(TEXT_FIELD_VARIANTS)('%s resolves in every state with a 3:1 edge and a 44 pt height', (variant) => {
      for (const focused of [false, true]) {
        for (const error of [false, true]) {
          for (const disabled of [false, true]) {
            const look = textFieldLook(theme, variant, { focused, error, disabled });
            expectTokenColors(theme, look.input);
            expect(contrastRatio(look.boundary, colors.background)).toBeGreaterThanOrEqual(BOUNDARY);
            expect(contrastRatio(String(look.input.color), look.fill)).toBeGreaterThanOrEqual(TEXT);
            expect(contrastRatio(look.placeholderColor, look.fill)).toBeGreaterThanOrEqual(TEXT);
            expect(Number(look.input.minHeight)).toBeGreaterThanOrEqual(MIN);
            expect(look.input.opacity).toBe(disabled ? theme.opacity.disabled : 1);
          }
        }
      }
    });

    it('boxed uses inputBorder at rest, ink when focused, danger on error', () => {
      const at = (focused: boolean, error: boolean) => textFieldLook(theme, 'boxed', { focused, error, disabled: false });
      expect(at(false, false).boundary).toBe(colors.inputBorder);
      expect(at(true, false).boundary).toBe(colors.text);
      expect(at(true, true).boundary).toBe(colors.danger);
      expect(textFieldLook(theme, 'underline', { focused: false, error: false, disabled: false }).input.borderBottomColor).toBe(colors.text);
    });
  });

  describe('Swatch', () => {
    it('pressable swatches resolve in every state with a 44 pt target', () => {
      for (const selected of [false, true]) {
        for (const state of CONTROL_STATES) {
          const look = swatchLook(theme, { ...state, selected, interactive: true });
          expectTokenColors(theme, look.container);
          expect(reach(look.container.minHeight, look.hitSlop)).toBeGreaterThanOrEqual(MIN);
          // A thicker outline is offset by less padding, so the content never moves.
          expect(Number(look.container.paddingLeft) + Number(look.container.borderWidth)).toBe(
            Number(swatchLook(theme, { ...state, selected: false, interactive: true }).container.paddingLeft) + theme.borders.hairline,
          );
        }
      }
      expect(swatchLook(theme, { selected: true, interactive: true, pressed: false, disabled: false }).container.borderColor).toBe(colors.text);
    });

    it('static swatches have no outline or hit slop', () => {
      const look = swatchLook(theme, { selected: false, interactive: false, pressed: false, disabled: false });
      expect(look.hitSlop).toBeUndefined();
      expect(look.container.borderWidth).toBeUndefined();
      expect(contrastRatio(String(look.label.color), colors.background)).toBeGreaterThanOrEqual(TEXT);
    });
  });

  describe('ScreenHeader and SectionLabel', () => {
    it.each(SCREEN_HEADER_VARIANTS)('%s resolves with readable text', (variant) => {
      const look = screenHeaderLook(theme, variant);
      expectTokenColors(theme, look.container);
      expect(contrastRatio(String(look.title.color), colors.background)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(String(look.aside.color), colors.background)).toBeGreaterThanOrEqual(TEXT);
      expect(reach(look.backButton.height, look.backHitSlop)).toBeGreaterThanOrEqual(MIN);
      expect(look.backButton.width).toBeGreaterThanOrEqual(MIN);
    });

    it('the masthead has a 2 pt ink rule and the display title; the step header a 1 pt rule', () => {
      const masthead = screenHeaderLook(theme, 'masthead');
      expect(masthead.container.borderBottomWidth).toBe(2);
      expect(masthead.rule).toEqual({ width: 2, color: colors.text });
      expect(masthead.title.fontSize).toBe(theme.typography.display.fontSize);
      expect(screenHeaderLook(theme, 'step').container.borderBottomWidth).toBe(1);
    });

    it('section labels are tracked uppercase ink', () => {
      expect(sectionLabelLook(theme)).toMatchObject({ textTransform: 'uppercase', color: colors.text });
    });
  });
});

describe('accessibility props', () => {
  it('buttons are named buttons that report disabled', () => {
    expect(buttonAccessibility('Save', true)).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Save',
      accessibilityState: { disabled: true },
    });
  });

  it('pressable chips report selected (except add); static chips are text', () => {
    expect(chipAccessibility('plain', 'Tops', { selected: true, disabled: false, interactive: true })).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Tops',
      accessibilityState: { selected: true, disabled: false },
    });
    const add = chipAccessibility('add', 'New tag', { selected: true, disabled: false, interactive: true });
    expect(add.accessibilityState).toEqual({ disabled: false });
    expect(add.accessibilityLabel).toBe('New tag');
    expect(chipText('add', 'New tag')).toBe('+ New tag');
    expect(chipAccessibility('styleTag', 'minimal', { selected: false, disabled: false, interactive: false })).toEqual({
      accessible: true,
      accessibilityRole: 'text',
      accessibilityLabel: 'minimal',
    });
  });

  it('segments are radios in a named radio group, checked and selected together', () => {
    expect(segmentedGroupAccessibility('Theme')).toEqual({ accessibilityRole: 'radiogroup', accessibilityLabel: 'Theme' });
    expect(segmentAccessibility('Dark', { selected: true, disabled: false })).toMatchObject({
      accessibilityRole: 'radio',
      accessibilityLabel: 'Dark',
      accessibilityState: { checked: true, selected: true, disabled: false },
    });
  });

  it('text fields carry the label and read the error before the hint', () => {
    expect(textFieldAccessibility('Name', { disabled: false, hint: 'Short' })).toEqual({
      accessibilityLabel: 'Name',
      accessibilityHint: 'Short',
      accessibilityState: { disabled: false },
    });
    expect(textFieldAccessibility('Name', { disabled: true, error: 'Required', hint: 'Short' }).accessibilityHint).toBe('Error: Required');
  });

  it('swatches are named by the color; pressable ones report selected', () => {
    expect(swatchAccessibility('Cream', { interactive: true, selected: true, disabled: false })).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Cream',
      accessibilityState: { selected: true, disabled: false },
    });
    expect(swatchAccessibility('Cream', { interactive: false, selected: false, disabled: false }).accessibilityRole).toBe('text');
  });

  it('headers and section labels are headers; the back button is named; steps read in words', () => {
    expect(screenHeaderAccessibility()).toEqual({
      title: { accessibilityRole: 'header' },
      back: { accessible: true, accessibilityRole: 'button', accessibilityLabel: 'Back' },
    });
    expect(SECTION_LABEL_ACCESSIBILITY.accessibilityRole).toBe('header');
    expect(stepText({ current: 1, total: 2 })).toBe('1/2');
    expect(stepAccessibilityLabel({ current: 1, total: 2 })).toBe('Step 1 of 2');
  });
});
