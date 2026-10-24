import { isNormalizedHex } from '@/core';

import {
  AA_TEXT_CONTRAST,
  contrastRatio,
  darkColors,
  emToPt,
  FONT_FAMILIES,
  fonts,
  lightColors,
  resolveColorScheme,
  SERIF_MIN_LINE_HEIGHT,
  themes,
  typography,
  type ThemeColors,
} from './index';

const ratio = (fg: string, bg: string) => Math.round(contrastRatio(fg, bg) * 100) / 100;

describe('color tokens', () => {
  it('dark has exactly the keys light has, and the reverse', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('every value in both themes is an uppercase #RRGGBB color', () => {
    for (const colors of [lightColors, darkColors]) {
      for (const [key, value] of Object.entries(colors)) {
        expect([key, isNormalizedHex(value)]).toEqual([key, true]);
      }
    }
  });

  it('uses the design README values', () => {
    expect(lightColors).toMatchObject({
      text: '#0E0E0E',
      background: '#FFFFFF',
      photoBackground: '#EDEBE7',
      photoBackgroundAlt: '#E4E1DB',
      hairline: '#E2DFD8',
      border: '#B9B6AF',
      textSecondary: '#5E5C58',
      textBodySecondary: '#4A4945',
      accent: '#C8102E',
    });
    expect(darkColors).toMatchObject({
      text: '#F2F0EB',
      background: '#0B0B0B',
      textSecondary: '#A3A19A',
      hairline: '#33322F',
      surface: '#1C1B19',
      accent: '#FF5A6E',
    });
  });

  it('themes pair each scheme with its colors and the shared scales', () => {
    expect(themes.light.colors).toBe(lightColors);
    expect(themes.dark.colors).toBe(darkColors);
    expect(themes.light.scheme).toBe('light');
    expect(themes.dark.scheme).toBe('dark');
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
    expect(themes.dark.typography).toBe(themes.light.typography);
  });
});

describe('contrast (WCAG AA, 4.5:1 for text)', () => {
  it('computes known ratios', () => {
    expect(ratio('#000000', '#FFFFFF')).toBe(21);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(contrastRatio('#0E0E0E', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#0E0E0E'));
  });

  const textRoles: (keyof ThemeColors)[] = ['text', 'textSecondary', 'textBodySecondary', 'danger', 'accent'];
  const backgrounds: (keyof ThemeColors)[] = ['background', 'surface', 'photoBackground'];

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('%s: text roles meet AA on the background, surface and photo background', (_name, colors) => {
    for (const fg of textRoles) {
      for (const bg of backgrounds) {
        expect([fg, bg, contrastRatio(colors[fg], colors[bg]) >= AA_TEXT_CONTRAST]).toEqual([fg, bg, true]);
      }
    }
  });

  it('records the measured ratios on the background', () => {
    const measured = (colors: ThemeColors) => ({
      text: ratio(colors.text, colors.background),
      textSecondary: ratio(colors.textSecondary, colors.background),
      textBodySecondary: ratio(colors.textBodySecondary, colors.background),
    });
    expect(measured(lightColors)).toEqual({ text: 19.3, textSecondary: 6.67, textBodySecondary: 9.01 });
    expect(measured(darkColors)).toEqual({ text: 17.28, textSecondary: 7.61, textBodySecondary: 11.64 });
  });

  it('orders the roles the same way in both themes: hairline < border < secondary < body secondary < text', () => {
    for (const c of [lightColors, darkColors]) {
      const steps = [c.hairline, c.border, c.textSecondary, c.textBodySecondary, c.text].map((v) =>
        contrastRatio(v, c.background),
      );
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    }
  });
});

describe('typography', () => {
  it('converts em letter spacing to points per size', () => {
    expect(emToPt(11, 0.18)).toBe(1.98);
    expect(emToPt(13, 0.16)).toBe(2.08);
    expect(emToPt(48, -0.02)).toBe(-0.96);
    expect(emToPt(15, 0)).toBe(0);
  });

  it('applies the conversion in the scale', () => {
    expect(typography.label).toMatchObject({ fontSize: 11, letterSpacing: 1.98, textTransform: 'uppercase' });
    expect(typography.button).toMatchObject({ fontSize: 13, letterSpacing: 2.08, textTransform: 'uppercase' });
    expect(typography.tabLabel.letterSpacing).toBe(1.54);
    expect(typography.chip.letterSpacing).toBe(1.44);
    expect(typography.body.letterSpacing).toBe(0);
  });

  it('uses the px tracking the mockups give titles as points, unconverted', () => {
    expect(typography.display).toMatchObject({ fontSize: 48, lineHeight: 58, letterSpacing: -1 });
    expect(typography.title).toMatchObject({ fontSize: 40, lineHeight: 48, letterSpacing: -1 });
    expect(typography.headline).toMatchObject({ fontSize: 32, lineHeight: 39, letterSpacing: -0.5 });
  });

  it('gives every serif variant room for Bodoni capitals above its deep descent', () => {
    const serif: string[] = Object.values(fonts.serif);
    for (const v of Object.values(typography)) {
      if (!serif.includes(v.fontFamily)) continue;
      expect(v.lineHeight).toBeGreaterThanOrEqual(v.fontSize * SERIF_MIN_LINE_HEIGHT);
    }
  });

  it('uses only loaded font families, serif for display and sans for UI text', () => {
    for (const v of Object.values(typography)) {
      expect(FONT_FAMILIES).toContain(v.fontFamily);
      expect(v.lineHeight).toBeGreaterThanOrEqual(v.fontSize);
    }
    const serif: string[] = Object.values(fonts.serif);
    for (const key of ['display', 'title', 'headline', 'itemName', 'itemNameSmall', 'styleTag'] as const) {
      expect(serif).toContain(typography[key].fontFamily);
    }
    const sans: string[] = Object.values(fonts.sans);
    for (const key of ['body', 'bodyLarge', 'bodySmall', 'caption', 'label', 'tabLabel', 'chip', 'button'] as const) {
      expect(sans).toContain(typography[key].fontFamily);
    }
  });

  it('lists each family once', () => {
    expect(new Set(FONT_FAMILIES).size).toBe(FONT_FAMILIES.length);
    expect(FONT_FAMILIES).toHaveLength(9);
  });
});

describe('resolveColorScheme', () => {
  it('maps dark to dark and anything else to light', () => {
    expect(resolveColorScheme('dark')).toBe('dark');
    expect(resolveColorScheme('light')).toBe('light');
    expect(resolveColorScheme('unspecified')).toBe('light');
    expect(resolveColorScheme(null)).toBe('light');
    expect(resolveColorScheme(undefined)).toBe('light');
  });
});

describe('Gate 3 slice 2 sizes and type', () => {
  const { sizes } = themes.light;

  it('Results photo heights shrink as more main pieces share the row; the small row stays smaller', () => {
    expect(sizes.lookPhotoHeightOne).toBeGreaterThan(sizes.lookPhotoHeightTwo);
    expect(sizes.lookPhotoHeightTwo).toBeGreaterThan(sizes.lookPhotoHeightThree);
    expect(sizes.lookPhotoHeightThree).toBeGreaterThan(sizes.lookSmallPhotoSize);
    expect(sizes.lookSmallPhotoSize).toBeGreaterThanOrEqual(sizes.minTouchTarget);
  });

  it('the request box fits three lines of its serif text plus padding', () => {
    const { inputSerif } = typography;
    expect(sizes.styleRequestMinHeight).toBeGreaterThanOrEqual(inputSerif.lineHeight * 3);
  });

  it('the new Style and Results type uses the serif faces at the mockup sizes', () => {
    expect(typography.displayItalic).toMatchObject({ fontFamily: fonts.serif.italic, fontSize: 46, letterSpacing: -1 });
    expect(typography.displayBold).toMatchObject({ fontFamily: fonts.serif.bold, fontSize: 46, letterSpacing: -1 });
    expect(typography.lookNumber).toMatchObject({ fontFamily: fonts.serif.bold, fontSize: 64 });
    expect(typography.requestTitle).toMatchObject({ fontFamily: fonts.serif.italic, fontSize: 24 });
    expect(typography.lookPieces).toMatchObject({ fontFamily: fonts.serif.regular, fontSize: 18 });
    expect(typography.recentRequest).toMatchObject({ fontFamily: fonts.serif.regular, fontSize: 16 });
  });
});
