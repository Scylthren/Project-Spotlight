import {
  deltaE2000,
  hexDeltaE,
  hexToLab,
  hexToLinearRgb,
  labToHex,
  linearRgbToHex,
  linearRgbToXyz,
  nearestPaletteColor,
  needsSwatchOutline,
  rankPaletteColors,
  xyzToLab,
  type Lab,
} from './color-science';
import { PALETTE, paletteColor } from './palette';

/**
 * All 34 pairs from Sharma, Wu & Dalal, "The CIEDE2000 Color-Difference
 * Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations", Color Research & Application 30(1), 2005, Table 1:
 * [L1, a1, b1, L2, a2, b2, deltaE00].
 */
const SHARMA_PAIRS: readonly (readonly number[])[] = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

const lab = (L: number, a: number, b: number): Lab => ({ L, a, b });

/** Rounds half away from zero to 4 places, as the published table does. */
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

describe('deltaE2000', () => {
  it.each(SHARMA_PAIRS.map((row, i) => [i + 1, row] as const))(
    'matches Sharma et al. (2005) pair %i to 4 decimal places',
    (_, [L1, a1, b1, L2, a2, b2, expected]) => {
      expect(round4(deltaE2000(lab(L1, a1, b1), lab(L2, a2, b2)))).toBe(expected);
    },
  );

  it('is symmetric and zero for identical colors', () => {
    for (const [L1, a1, b1, L2, a2, b2] of SHARMA_PAIRS) {
      const x = lab(L1, a1, b1);
      const y = lab(L2, a2, b2);
      expect(deltaE2000(x, y)).toBeCloseTo(deltaE2000(y, x), 10);
      expect(deltaE2000(x, x)).toBe(0);
    }
  });
});

describe('sRGB -> CIELAB (D65)', () => {
  // References: Bruce Lindbloom's calculator (sRGB, D65, no adaptation), to 2 decimals.
  it.each([
    ['#FFFFFF', 100, 0, 0],
    ['#000000', 0, 0, 0],
    ['#FF0000', 53.24, 80.09, 67.2],
    ['#00FF00', 87.73, -86.18, 83.18],
    ['#0000FF', 32.3, 79.19, -107.86],
    ['#808080', 53.59, 0, 0],
    ['#FFFF00', 97.14, -21.55, 94.48],
  ])('%s -> L %d, a %d, b %d', (hex, L, a, b) => {
    const result = hexToLab(hex);
    expect(result.L).toBeCloseTo(L, 2);
    expect(result.a).toBeCloseTo(a, 2);
    expect(result.b).toBeCloseTo(b, 2);
  });

  it('linearizes with the sRGB transfer curve, including the linear toe', () => {
    expect(hexToLinearRgb('#FFFFFF')).toEqual([1, 1, 1]);
    // 10/255 = 0.0392 is below the 0.04045 knee: divided by 12.92.
    expect(hexToLinearRgb('#0A0A0A')[0]).toBeCloseTo(10 / 255 / 12.92, 12);
    // 128/255 is on the power curve: 0.2158605.
    expect(hexToLinearRgb('#808080')[0]).toBeCloseTo(0.2158605, 6);
  });

  it('maps sRGB white to the D65 white point', () => {
    const [x, y, z] = linearRgbToXyz([1, 1, 1]);
    expect(x).toBeCloseTo(0.95047, 5);
    expect(y).toBeCloseTo(1, 5);
    expect(z).toBeCloseTo(1.08883, 5);
    const white = xyzToLab([x, y, z]);
    expect(white.L).toBeCloseTo(100, 4);
    expect(white.a).toBeCloseTo(0, 4);
    expect(white.b).toBeCloseTo(0, 4);
  });

  it('round-trips every 8-bit gray and every palette color through Lab', () => {
    for (let v = 0; v < 256; v++) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`.toUpperCase();
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
    for (const color of PALETTE) expect(labToHex(hexToLab(color.hex))).toBe(color.hex);
    for (const hex of ['#C8102E', '#00FF00', '#0000FF', '#123456', '#FEDCBA']) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  it('accepts #RGB and any case, clamps out-of-gamut values, and rejects malformed hex', () => {
    expect(hexToLab('#fff')).toEqual(hexToLab('#FFFFFF'));
    expect(hexToLab('#c8102e')).toEqual(hexToLab('#C8102E'));
    expect(linearRgbToHex([1.4, -0.2, 0.5])).toBe(linearRgbToHex([1, 0, 0.5]));
    for (const bad of ['', '#12345', '#GGGGGG', 'navy', '#1234567']) {
      expect(() => hexToLab(bad)).toThrow(/not a hex color/);
    }
  });
});

describe('nearestPaletteColor', () => {
  it.each([
    ['#000080', 'navy'],
    ['#000000', 'black'],
    ['#FFFFFF', 'white'],
    ['#FF0000', 'red'],
    ['#808080', 'grey'],
    ['#008080', 'teal'],
    ['#800000', 'burgundy'],
    ['#FFC0CB', 'pink'],
    ['#87CEFA', 'sky-blue'],
    ['#FFFDD0', 'cream'],
    ['#FFA500', 'orange'],
    ['#228B22', 'green'],
  ])('%s -> %s', (hex, id) => {
    expect(nearestPaletteColor(hex).id).toBe(id);
  });

  it('returns each palette color for its own reference hex', () => {
    for (const color of PALETTE) expect(nearestPaletteColor(color.hex)).toBe(color);
  });

  it('ranks the whole palette by distance, closest first', () => {
    const ranked = rankPaletteColors('#202A60');
    expect(ranked).toHaveLength(PALETTE.length);
    expect(ranked[0]).toEqual({ color: paletteColor('navy'), deltaE: 0 });
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].deltaE).toBeGreaterThanOrEqual(ranked[i - 1].deltaE);
  });

  it('uses perceptual distance, not RGB distance', () => {
    const rgbNearest = (hex: string) => {
      const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [r, g, b] = channels(hex);
      let best = PALETTE[0];
      let bestDistance = Infinity;
      for (const color of PALETTE) {
        const [r2, g2, b2] = channels(color.hex);
        const d = Math.hypot(r - r2, g - g2, b - b2);
        if (d < bestDistance) [best, bestDistance] = [color, d];
      }
      return best.id;
    };
    // A very dark green. Its channels are numerically closest to black's
    // (#111111), but the eye sees a dark green, and CIEDE2000 agrees.
    const hex = '#003300';
    expect(rgbNearest(hex)).toBe('black');
    expect(nearestPaletteColor(hex).id).toBe('forest-green');
    expect(hexDeltaE(hex, paletteColor('forest-green')!.hex)).toBeLessThan(hexDeltaE(hex, paletteColor('black')!.hex));
    // Same for a dusty blue-green: RGB says denim blue, CIEDE2000 says teal.
    expect(rgbNearest('#447777')).toBe('denim-blue');
    expect(nearestPaletteColor('#447777').id).toBe('teal');
  });
});

describe('needsSwatchOutline', () => {
  it('outlines light swatches on a light background and dark ones on a dark background', () => {
    const light = '#FFFFFF';
    const dark = '#000000';
    for (const id of ['white', 'cream', 'light-grey']) {
      expect(needsSwatchOutline(paletteColor(id)!.hex, light)).toBe(true);
      expect(needsSwatchOutline(paletteColor(id)!.hex, dark)).toBe(false);
    }
    for (const id of ['black', 'charcoal', 'navy']) {
      expect(needsSwatchOutline(paletteColor(id)!.hex, dark)).toBe(true);
      expect(needsSwatchOutline(paletteColor(id)!.hex, light)).toBe(false);
    }
    for (const id of ['red', 'blue', 'mustard']) {
      expect(needsSwatchOutline(paletteColor(id)!.hex, light)).toBe(false);
      expect(needsSwatchOutline(paletteColor(id)!.hex, dark)).toBe(false);
    }
  });
});
