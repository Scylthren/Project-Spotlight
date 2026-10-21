import { srgbBytesToLab, hexToLab, deltaE76 } from './color-science';
import {
  isValidRgbaImage,
  SEGMENTATION_DEFAULTS,
  segmentationConfidence,
  segmentGarment,
  type Segmentation,
  type SegmentationResult,
} from './garment-segmentation';
import { MIN_DETECTION_CONFIDENCE } from './color-selection';
import { paletteColor } from './palette';
import { garmentPhoto, inBox, jitter, maskBoxIoU, paintImage, rgb, GARMENT_BOX } from './testing/synthetic-images';

const NAVY = rgb(paletteColor('navy')!.hex);
const RED = rgb(paletteColor('red')!.hex);
const WHITE = rgb('#F4F4F2');

function segmented(result: SegmentationResult): Segmentation {
  if (!result.ok) throw new Error(`expected a garment, got ${result.reason}`);
  return result.segmentation;
}

describe('srgbBytesToLab', () => {
  it('matches hexToLab', () => {
    const lab = srgbBytesToLab(0x20, 0x2a, 0x60);
    const ref = hexToLab('#202A60');
    expect(deltaE76(lab, ref)).toBeLessThan(1e-9);
  });
});

describe('isValidRgbaImage', () => {
  it('needs 4 bytes per pixel and positive integer sizes', () => {
    expect(isValidRgbaImage({ width: 2, height: 2, data: new Uint8Array(16) })).toBe(true);
    expect(isValidRgbaImage({ width: 2, height: 2, data: new Uint8Array(12) })).toBe(false);
    expect(isValidRgbaImage({ width: 0, height: 2, data: new Uint8Array(0) })).toBe(false);
    expect(isValidRgbaImage({ width: 1.5, height: 2, data: new Uint8Array(12) })).toBe(false);
  });
});

describe('segmentGarment', () => {
  it('finds a solid navy shirt on a white backdrop, confidently', () => {
    const image = garmentPhoto((x, y) => jitter(NAVY, x, y, 4), (x, y) => jitter(WHITE, x, y, 4));
    const s = segmented(segmentGarment(image));
    expect(maskBoxIoU(s.mask, image.width)).toBeGreaterThan(0.98);
    expect(s.confidence).toBeGreaterThan(0.9);
    expect(s.signals.borderTouch).toBe(0);
    expect(s.signals.borderUniformity).toBe(1);
  });

  it('follows a soft lighting gradient on the backdrop', () => {
    // Backdrop darkens from 245 to 205 across the frame (deltaE ~15 end to end).
    const image = garmentPhoto(
      () => RED,
      (x) => {
        const v = Math.round(245 - (40 * x) / 95);
        return [v, v, v - 4];
      },
    );
    const s = segmented(segmentGarment(image));
    expect(maskBoxIoU(s.mask, image.width)).toBeGreaterThan(0.98);
    expect(s.confidence).toBeGreaterThan(MIN_DETECTION_CONFIDENCE);
  });

  it('fails on an image that is all backdrop', () => {
    const image = paintImage(96, 128, (x, y) => jitter(WHITE, x, y, 5));
    expect(segmentGarment(image)).toEqual({ ok: false, reason: 'no_garment' });
  });

  it('treats a two-tone backdrop (wall above floor) as background', () => {
    const image = garmentPhoto(() => RED, (x, y) => (y < 70 ? WHITE : rgb('#8C6E4F')));
    const s = segmented(segmentGarment(image));
    expect(maskBoxIoU(s.mask, image.width)).toBeGreaterThan(0.98);
    expect(s.confidence).toBeGreaterThan(MIN_DETECTION_CONFIDENCE);
  });

  it('fails when the garment is almost the same color as the backdrop', () => {
    // deltaE76 ~ 5: indistinguishable at this threshold.
    const image = garmentPhoto(() => rgb('#8A8A8A'), () => rgb('#959595'));
    expect(segmentGarment(image)).toEqual({ ok: false, reason: 'no_garment' });
  });

  it('is unsure when the garment is only a little different from the backdrop', () => {
    // deltaE76 ~ 18: found, but too close to trust.
    const garment = rgb('#7A7A7A');
    const backdrop = rgb('#9F9F9F');
    expect(deltaE76(srgbBytesToLab(...(garment.slice(0, 3) as [number, number, number])), srgbBytesToLab(...(backdrop.slice(0, 3) as [number, number, number])))).toBeGreaterThan(12);
    const s = segmented(segmentGarment(garmentPhoto(() => garment, () => backdrop)));
    expect(s.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it('fails on a speck and is unsure about a very small "garment"', () => {
    const speck = garmentPhoto(() => NAVY, () => WHITE, { x0: 40, y0: 60, x1: 46, y1: 66 });
    expect(segmentGarment(speck)).toEqual({ ok: false, reason: 'no_garment' });
    const small = garmentPhoto(() => NAVY, () => WHITE, { x0: 40, y0: 60, x1: 52, y1: 72 });
    const s = segmented(segmentGarment(small));
    expect(s.signals.garmentShare).toBeLessThan(0.03);
    expect(s.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it('is unsure when the garment fills the frame and touches every edge', () => {
    // Close-up: the frame border is mostly the garment, with a logo in the middle.
    const image = garmentPhoto(() => RED, () => NAVY, { x0: 0, y0: 0, x1: 96, y1: 128 });
    expect(segmentGarment(image)).toEqual({ ok: false, reason: 'no_garment' });
    const withLogo = paintImage(96, 128, (x, y) => (inBox(x, y, { x0: 38, y0: 52, x1: 58, y1: 76 }) ? WHITE : NAVY));
    const s = segmented(segmentGarment(withLogo));
    expect(s.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it('is less sure about a garment cut off by the frame', () => {
    const inside = segmented(segmentGarment(garmentPhoto(() => NAVY, () => WHITE)));
    // Hangs off the bottom edge: that edge is mostly garment, but it is not the backdrop.
    const cut = segmented(segmentGarment(garmentPhoto(() => NAVY, () => WHITE, { x0: 10, y0: 30, x1: 86, y1: 128 })));
    expect(maskBoxIoU(cut.mask, 96, { x0: 10, y0: 30, x1: 86, y1: 128 })).toBe(1);
    expect(cut.signals.borderTouch).toBeGreaterThan(0.1);
    expect(cut.confidence).toBeLessThan(inside.confidence);
  });

  it('keeps only the largest piece and fills enclosed gaps', () => {
    // A navy shirt with backdrop-colored stripes enclosed in it, plus a small red sock elsewhere.
    const image = paintImage(96, 128, (x, y) => {
      if (inBox(x, y, { x0: 4, y0: 4, x1: 10, y1: 10 })) return RED;
      if (!inBox(x, y)) return WHITE;
      const innerStripe =
        x > GARMENT_BOX.x0 + 3 && x < GARMENT_BOX.x1 - 4 && y > GARMENT_BOX.y0 + 3 && y < GARMENT_BOX.y1 - 4 && y % 8 < 3;
      return innerStripe ? WHITE : NAVY;
    });
    const s = segmented(segmentGarment(image));
    expect(maskBoxIoU(s.mask, image.width)).toBeGreaterThan(0.99);
    expect(s.mask[5 * 96 + 5]).toBe(0); // the sock
  });

  it('ignores transparent pixels: a cutout with a clear background segments cleanly', () => {
    const image = garmentPhoto(() => NAVY, () => [255, 0, 0, 0]);
    const s = segmented(segmentGarment(image));
    expect(maskBoxIoU(s.mask, image.width)).toBe(1);
    expect(s.signals.separation).toBe(Infinity);
    expect(s.confidence).toBeGreaterThan(0.9);
  });

  it('never puts transparent pixels in the garment, even inside it', () => {
    const hole = { x0: 40, y0: 50, x1: 56, y1: 70 };
    const image = garmentPhoto((x, y) => (inBox(x, y, hole) ? [0, 0, 0, 10] : NAVY), () => WHITE);
    const s = segmented(segmentGarment(image));
    for (let y = hole.y0; y < hole.y1; y++) for (let x = hole.x0; x < hole.x1; x++) expect(s.mask[y * 96 + x]).toBe(0);
  });

  it('fails on an all-transparent image and an invalid one', () => {
    expect(segmentGarment(paintImage(8, 8, () => [0, 0, 0, 0]))).toEqual({ ok: false, reason: 'no_garment' });
    expect(segmentGarment({ width: 3, height: 3, data: new Uint8Array(5) })).toEqual({
      ok: false,
      reason: 'invalid_image',
    });
  });

  it('is deterministic', () => {
    const image = garmentPhoto((x, y) => jitter(RED, x, y, 6), (x, y) => jitter(WHITE, x, y, 6));
    const a = segmented(segmentGarment(image));
    const b = segmented(segmentGarment(image));
    expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
    expect(a.confidence).toBe(b.confidence);
  });
});

describe('segmentationConfidence', () => {
  const good = { garmentShare: 0.3, borderTouch: 0, borderUniformity: 1, separation: 60 };

  it('is 1 for a clear, framed garment on a plain backdrop', () => {
    expect(segmentationConfidence(good)).toBe(1);
  });

  it('drops to 0 for a speck or a frame-filling "garment", or no separation', () => {
    expect(segmentationConfidence({ ...good, garmentShare: 0.02 })).toBe(0);
    expect(segmentationConfidence({ ...good, garmentShare: 0.97 })).toBe(0);
    expect(segmentationConfidence({ ...good, separation: SEGMENTATION_DEFAULTS.backgroundDeltaE })).toBe(0);
  });

  it('halves at most for a busy backdrop or a cut-off garment', () => {
    expect(segmentationConfidence({ ...good, borderUniformity: 0 })).toBe(0.5);
    expect(segmentationConfidence({ ...good, borderTouch: 1 })).toBe(0.5);
  });
});
