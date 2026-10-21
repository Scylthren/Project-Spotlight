import { hexDeltaE } from './color-science';
import { MIN_DETECTION_CONFIDENCE, prefillDetectedColors } from './color-selection';
import {
  extractGarmentColors,
  kMeansLab,
  seededRandom,
  toDetectedColors,
  type ColorExtractionResult,
  type ExtractedColor,
} from './garment-colors';
import { segmentGarment, type RgbaImage } from './garment-segmentation';
import { paletteColor } from './palette';
import { garmentPhoto, inBox, jitter, paintImage, rgb, type Rgba } from './testing/synthetic-images';

const hexOf = (id: string) => paletteColor(id)!.hex;
const NAVY = rgb(hexOf('navy'));
const RED = rgb(hexOf('red'));
const MUSTARD = rgb(hexOf('mustard'));
const WHITE = rgb('#F4F4F2');
const BEIGE_WALL = rgb('#B9B4A8');

function colors(result: ColorExtractionResult): ExtractedColor[] {
  if (!result.ok) throw new Error(`expected colors, got ${result.reason}`);
  return result.colors;
}

/** Segment, then extract: the whole pure pipeline. */
function detect(image: RgbaImage): ExtractedColor[] {
  const s = segmentGarment(image);
  if (!s.ok) throw new Error(`segmentation failed: ${s.reason}`);
  return colors(extractGarmentColors(image, s.segmentation.mask, s.segmentation.confidence));
}

/** Two-color horizontal stripes: `a` for `aRows` rows, then `b` for `bRows`. */
function stripes(a: Rgba, b: Rgba, aRows: number, bRows: number) {
  return (x: number, y: number) => ((y % (aRows + bRows)) < aRows ? jitter(a, x, y, 3) : jitter(b, x, y, 3));
}

describe('seededRandom', () => {
  it('repeats for a seed and stays in 0..1', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('kMeansLab', () => {
  it('stops adding centers when every point is covered', () => {
    const points = Array.from({ length: 10 }, () => ({ L: 50, a: 0, b: 0 }));
    expect(kMeansLab(points, 5, 10, 1)).toEqual([{ L: 50, a: 0, b: 0, weight: 10 }]);
  });

  it('returns nothing for no points', () => {
    expect(kMeansLab([], 5, 10, 1)).toEqual([]);
  });
});

describe('extractGarmentColors', () => {
  it('finds the primary color of a solid shirt on a white backdrop', () => {
    const found = detect(garmentPhoto((x, y) => jitter(NAVY, x, y, 5), (x, y) => jitter(WHITE, x, y, 5)));
    expect(found.map((c) => c.paletteId)).toEqual(['navy']);
    expect(found[0].share).toBe(1);
    expect(hexDeltaE(found[0].hex, hexOf('navy'))).toBeLessThan(3);
    expect(found[0].confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it('merges light and shadow of one fabric into one color', () => {
    // Folds: the red is 15% darker in bands.
    const shaded = (x: number, y: number): Rgba => {
      const f = y % 10 < 4 ? 0.85 : 1;
      return [Math.round(RED[0] * f), Math.round(RED[1] * f), Math.round(RED[2] * f)];
    };
    const found = detect(garmentPhoto(shaded, () => WHITE));
    expect(found.map((c) => c.paletteId)).toEqual(['red']);
  });

  it('finds a primary and a secondary on a striped garment', () => {
    const found = detect(garmentPhoto(stripes(RED, NAVY, 3, 2), () => BEIGE_WALL));
    expect(found.map((c) => c.paletteId)).toEqual(['red', 'navy']);
    expect(found[0].share).toBeGreaterThan(found[1].share);
    expect(found[1].share).toBeGreaterThan(0.3);
  });

  it('leaves out a color under 10% of the garment', () => {
    // Mustard shirt with a small navy patch (~4%).
    const patch = { x0: 40, y0: 50, x1: 50, y1: 64 };
    const found = detect(garmentPhoto((x, y) => (inBox(x, y, patch) ? NAVY : MUSTARD), () => WHITE));
    expect(found.map((c) => c.paletteId)).toEqual(['mustard']);
  });

  it('keeps at most three colors', () => {
    const quarters = (x: number): Rgba => [RED, NAVY, MUSTARD, rgb(hexOf('green'))][Math.floor((x - 24) / 12)];
    const found = detect(garmentPhoto(quarters, () => WHITE));
    expect(found.length).toBe(3);
    expect(new Set(found.map((c) => c.paletteId)).size).toBe(3);
  });

  it('ignores transparent pixels even inside the mask', () => {
    // Left half see-through red (alpha 0), right half opaque navy; mask covers all of it.
    const image = paintImage(20, 20, (x) => (x < 10 ? [200, 16, 46, 0] : NAVY));
    const mask = new Uint8Array(400).fill(1);
    const found = colors(extractGarmentColors(image, mask, 1));
    expect(found.map((c) => c.paletteId)).toEqual(['navy']);
  });

  it('only reads pixels in the mask', () => {
    const image = paintImage(20, 20, (x) => (x < 10 ? RED : NAVY));
    const mask = new Uint8Array(400);
    for (let i = 0; i < 400; i++) if (i % 20 < 10) mask[i] = 1;
    expect(colors(extractGarmentColors(image, mask, 1)).map((c) => c.paletteId)).toEqual(['red']);
  });

  it('fails with too few garment pixels or a mismatched mask', () => {
    const image = paintImage(20, 20, () => NAVY);
    expect(extractGarmentColors(image, new Uint8Array(400), 1)).toEqual({ ok: false, reason: 'too_few_pixels' });
    expect(extractGarmentColors(image, new Uint8Array(10).fill(1), 1)).toEqual({ ok: false, reason: 'too_few_pixels' });
  });

  it('caps confidence by the isolation confidence', () => {
    const image = paintImage(20, 20, () => NAVY);
    const mask = new Uint8Array(400).fill(1);
    const [sure] = colors(extractGarmentColors(image, mask, 1));
    const [unsure] = colors(extractGarmentColors(image, mask, 0.4));
    expect(sure.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
    expect(unsure.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
    expect(colors(extractGarmentColors(image, mask, NaN))[0].confidence).toBe(0);
  });

  it('is less sure of a color far from every palette color', () => {
    const mask = new Uint8Array(400).fill(1);
    const [onPalette] = colors(extractGarmentColors(paintImage(20, 20, () => NAVY), mask, 1));
    // A murky blue-violet between navy, purple and denim.
    const [between] = colors(extractGarmentColors(paintImage(20, 20, () => rgb('#4A3F8A')), mask, 1));
    expect(between.paletteDeltaE).toBeGreaterThan(onPalette.paletteDeltaE);
    expect(between.confidence).toBeLessThan(onPalette.confidence);
  });

  it('gives low confidence for a garment on a similar backdrop', () => {
    const found = detect(garmentPhoto(() => rgb('#7A7A7A'), () => rgb('#9F9F9F')));
    expect(found[0].confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
    // So the form opens the matrix with the guesses preselected.
    expect(prefillDetectedColors(toDetectedColors(found)).notice).not.toBeNull();
  });

  it('is deterministic', () => {
    const image = garmentPhoto(stripes(RED, NAVY, 3, 2), (x, y) => jitter(BEIGE_WALL, x, y, 6));
    expect(detect(image)).toEqual(detect(image));
  });

  it('runs the whole pipeline on a 96x128 photo in well under 50 ms (Node)', () => {
    const image = garmentPhoto(stripes(RED, NAVY, 3, 2), (x, y) => jitter(BEIGE_WALL, x, y, 6));
    detect(image); // warm up the JIT
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      detect(image);
      best = Math.min(best, performance.now() - start);
    }
    // Hermes has no JIT and is several times slower; this leaves room for that on device.
    expect(best).toBeLessThan(50);
  });
});

describe('toDetectedColors', () => {
  it('keeps id, hex and confidence only', () => {
    expect(
      toDetectedColors([{ paletteId: 'navy', hex: '#202A60', share: 1, paletteDeltaE: 0, confidence: 0.9 }]),
    ).toEqual([{ paletteId: 'navy', hex: '#202A60', confidence: 0.9 }]);
  });
});
