/**
 * Finds the garment in a small photo so its colors can be measured (slice 4).
 * Pure functions over decoded RGBA pixels; no I/O.
 *
 * This is a cheap on-device heuristic used only for color detection. It does
 * not make a stored cutout (that is a Gate 2 decision, behind
 * `GarmentIsolator`). It assumes the usual closet photo: one garment roughly
 * centered on a plain-ish backdrop (bed, floor, wall, hanger on a door).
 *
 * 1. Background model: the colors along the image border, clustered in Lab.
 *    The largest cluster is background; others too if they cover at least
 *    `minBorderClusterShare` of the border and of two of its sides.
 * 2. Flood fill from the border through pixels close to a background cluster
 *    (CIE76 distance below `backgroundDeltaE`), or, for soft shading on the
 *    backdrop, a little further when the step from the neighbor is tiny.
 * 3. What the fill did not reach is foreground. The largest 4-connected piece
 *    is the garment; enclosed gaps in it are filled (stripes the same color
 *    as the backdrop stay part of the garment).
 * 4. Confidence (0..1) from four signals, see `segmentationConfidence`.
 *
 * Pixels with alpha below `alphaThreshold` are ignored everywhere: never
 * garment, never part of the background model, and the fill passes through
 * them. That makes a real cutout (transparent background, Gate 2) segment
 * cleanly. Distances here are CIE76, not CIEDE2000: this runs per pixel on
 * the JS thread and CIE76 is ~20x cheaper; palette matching later uses
 * CIEDE2000.
 */
import { deltaE76, srgbBytesToLab, type Lab } from './color-science';

/** Decoded pixels, row-major RGBA, 4 bytes per pixel (jpeg-js `formatAsRGBA`). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface SegmentationOptions {
  /** Pixels with alpha below this are ignored (treated as see-through background). */
  alphaThreshold: number;
  /** CIE76 distance within which a pixel counts as background. */
  backgroundDeltaE: number;
  /** Shading allowance: a pixel up to `backgroundDeltaE * shadingFactor` away still counts if... */
  shadingFactor: number;
  /** ...it is at most this far from the background neighbor the fill came from. */
  shadingStepDeltaE: number;
  /** Border colors within this distance of a cluster join it. */
  borderClusterDeltaE: number;
  /**
   * Besides the biggest border cluster, another is background only if it
   * covers at least this share of the border and of at least two sides.
   */
  minBorderClusterShare: number;
  /** Below this share of the frame there is no garment at all. */
  minGarmentShare: number;
}

export const SEGMENTATION_DEFAULTS: Readonly<SegmentationOptions> = Object.freeze({
  alphaThreshold: 128,
  backgroundDeltaE: 12,
  shadingFactor: 1.5,
  shadingStepDeltaE: 3,
  borderClusterDeltaE: 10,
  minBorderClusterShare: 0.1,
  minGarmentShare: 0.01,
});

/** The measurements behind the confidence, kept for tests and tuning. */
export interface SegmentationSignals {
  /** Garment pixels / all pixels in the frame (transparent ones included). */
  garmentShare: number;
  /** Share of border pixels that are garment (a garment cut off by the frame). */
  borderTouch: number;
  /** Share of visible border pixels the background clusters explain (1 = plain backdrop). */
  borderUniformity: number;
  /** Median CIE76 distance from garment pixels to the background (Infinity without one). */
  separation: number;
}

export interface Segmentation {
  width: number;
  height: number;
  /** One byte per pixel: 1 = garment, 0 = not. */
  mask: Uint8Array;
  garmentPixels: number;
  confidence: number;
  signals: SegmentationSignals;
}

export type SegmentationFailure = 'invalid_image' | 'no_garment';

export type SegmentationResult = { ok: true; segmentation: Segmentation } | { ok: false; reason: SegmentationFailure };

/** True if `image` has positive integer dimensions and exactly 4 bytes per pixel. */
export function isValidRgbaImage(image: RgbaImage): boolean {
  const { width, height, data } = image;
  return (
    Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && data.length === width * height * 4
  );
}

interface Cluster {
  L: number;
  a: number;
  b: number;
  count: number;
  /** Border pixels per side: top, right, bottom, left. */
  sides: [number, number, number, number];
}

/** Leader clustering of border colors: join the nearest cluster within `radius`, else start one. */
function clusterBorder(colors: readonly { lab: Lab; sides: readonly number[] }[], radius: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (const { lab: c, sides } of colors) {
    let best: Cluster | null = null;
    let bestDistance = radius;
    for (const k of clusters) {
      const d = deltaE76(c, k);
      if (d < bestDistance) {
        best = k;
        bestDistance = d;
      }
    }
    if (!best) {
      best = { L: c.L, a: c.a, b: c.b, count: 0, sides: [0, 0, 0, 0] };
      clusters.push(best);
    }
    best.count += 1;
    best.L += (c.L - best.L) / best.count;
    best.a += (c.a - best.a) / best.count;
    best.b += (c.b - best.b) / best.count;
    for (const side of sides) best.sides[side] += 1;
  }
  return clusters.sort((x, y) => y.count - x.count);
}

/** Linear ramp: 0 at `from`, 1 at `to` (works for from > to too), clamped. */
function ramp(value: number, from: number, to: number): number {
  const t = (value - from) / (to - from);
  return Math.min(1, Math.max(0, t));
}

/**
 * Confidence 0..1 that the mask is the garment, from the signals:
 * - garment share: under ~3% or over ~95% of the picture is suspicious
 *   (a speck, or the "background" is really the garment filling the frame);
 *   full marks between 10% and 80%;
 * - separation: the garment's median distance from the backdrop, full marks
 *   at 3x `backgroundDeltaE` (clearly different colors), zero at 1x;
 * - border uniformity and border touch soften the result by up to half each
 *   (a busy backdrop, or a garment cut off by the frame).
 */
export function segmentationConfidence(
  signals: SegmentationSignals,
  backgroundDeltaE: number = SEGMENTATION_DEFAULTS.backgroundDeltaE,
): number {
  const share = Math.min(ramp(signals.garmentShare, 0.03, 0.1), ramp(signals.garmentShare, 0.95, 0.8));
  const separation = ramp(signals.separation, backgroundDeltaE, 3 * backgroundDeltaE);
  const uniformity = ramp(signals.borderUniformity, 0.5, 0.9);
  const touch = ramp(signals.borderTouch, 0.5, 0.1);
  return share * separation * (0.5 + 0.5 * uniformity) * (0.5 + 0.5 * touch);
}

/** Finds the garment. See the module comment for the method. */
export function segmentGarment(image: RgbaImage, overrides: Partial<SegmentationOptions> = {}): SegmentationResult {
  if (!isValidRgbaImage(image)) return { ok: false, reason: 'invalid_image' };
  const opts = { ...SEGMENTATION_DEFAULTS, ...overrides };
  const { width, height, data } = image;
  const n = width * height;

  // Per-pixel Lab and visibility.
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const opaque = new Uint8Array(n);
  let opaqueCount = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3] < opts.alphaThreshold) continue;
    opaque[i] = 1;
    opaqueCount += 1;
    const lab = srgbBytesToLab(data[o], data[o + 1], data[o + 2]);
    L[i] = lab.L;
    A[i] = lab.a;
    B[i] = lab.b;
  }
  if (opaqueCount === 0) return { ok: false, reason: 'no_garment' };

  // Border ring, each pixel once.
  const border: number[] = [];
  for (let x = 0; x < width; x++) {
    border.push(x);
    if (height > 1) border.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    border.push(y * width);
    if (width > 1) border.push(y * width + width - 1);
  }
  const labAt = (i: number): Lab => ({ L: L[i], a: A[i], b: B[i] });

  // 1. Background clusters from the visible border pixels. The biggest is
  // always background. Another one counts only if it is big and shows up on
  // at least two sides (a wall above a floor), not one (a garment hanging
  // off the bottom edge).
  const visibleBorder = border.filter((i) => opaque[i] === 1);
  const sidesOf = (i: number): number[] => {
    const x = i % width;
    const y = (i - x) / width;
    const sides: number[] = [];
    if (y === 0) sides.push(0);
    if (x === width - 1) sides.push(1);
    if (y === height - 1) sides.push(2);
    if (x === 0) sides.push(3);
    return sides;
  };
  const sideLength = [width, height, width, height];
  const clusters = clusterBorder(
    visibleBorder.map((i) => ({ lab: labAt(i), sides: sidesOf(i) })),
    opts.borderClusterDeltaE,
  );
  const background = clusters.filter(
    (c, rank) =>
      rank === 0 ||
      (c.count >= opts.minBorderClusterShare * visibleBorder.length &&
        c.sides.filter((count, side) => count >= opts.minBorderClusterShare * sideLength[side]).length >= 2),
  );
  const distance = new Float32Array(n).fill(Infinity);
  if (background.length > 0) {
    for (let i = 0; i < n; i++) {
      if (!opaque[i]) continue;
      let best = Infinity;
      for (const c of background) {
        const d = Math.hypot(L[i] - c.L, A[i] - c.a, B[i] - c.b);
        if (d < best) best = d;
      }
      distance[i] = best;
    }
  }

  // 2. Flood fill the background from the border.
  const isBackground = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const i of border) {
    if (!isBackground[i] && (!opaque[i] || distance[i] < opts.backgroundDeltaE)) {
      isBackground[i] = 1;
      queue[tail++] = i;
    }
  }
  const shadingLimit = opts.backgroundDeltaE * opts.shadingFactor;
  const tryVisit = (from: number, to: number) => {
    if (isBackground[to]) return;
    let joins = !opaque[to] || distance[to] < opts.backgroundDeltaE;
    if (!joins && opaque[from] && distance[to] < shadingLimit) {
      joins = Math.hypot(L[to] - L[from], A[to] - A[from], B[to] - B[from]) < opts.shadingStepDeltaE;
    }
    if (joins) {
      isBackground[to] = 1;
      queue[tail++] = to;
    }
  };
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) tryVisit(i, i - 1);
    if (x < width - 1) tryVisit(i, i + 1);
    if (i >= width) tryVisit(i, i - width);
    if (i < n - width) tryVisit(i, i + width);
  }

  // 3. Largest connected foreground piece.
  const label = new Int32Array(n);
  let bestLabel = 0;
  let bestSize = 0;
  let nextLabel = 0;
  for (let start = 0; start < n; start++) {
    if (!opaque[start] || isBackground[start] || label[start]) continue;
    nextLabel += 1;
    let size = 0;
    head = 0;
    tail = 0;
    queue[tail++] = start;
    label[start] = nextLabel;
    while (head < tail) {
      const i = queue[head++];
      size += 1;
      const x = i % width;
      const visit = (j: number) => {
        if (opaque[j] && !isBackground[j] && !label[j]) {
          label[j] = nextLabel;
          queue[tail++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (i >= width) visit(i - width);
      if (i < n - width) visit(i + width);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = nextLabel;
    }
  }
  if (bestSize === 0 || bestSize < opts.minGarmentShare * n) return { ok: false, reason: 'no_garment' };

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] === bestLabel) mask[i] = 1;

  // Fill enclosed gaps: visible non-garment pixels the outside cannot reach
  // without crossing the garment. Transparent holes stay out.
  const outside = new Uint8Array(n);
  head = 0;
  tail = 0;
  for (const i of border) {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const visit = (j: number) => {
      if (!mask[j] && !outside[j]) {
        outside[j] = 1;
        queue[tail++] = j;
      }
    };
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < n - width) visit(i + width);
  }
  let garmentPixels = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] && !outside[i] && opaque[i]) mask[i] = 1;
    if (mask[i]) garmentPixels += 1;
  }

  // 4. Signals.
  const garmentDistances = new Float32Array(garmentPixels);
  let k = 0;
  for (let i = 0; i < n; i++) if (mask[i]) garmentDistances[k++] = distance[i];
  garmentDistances.sort();
  const separation = garmentDistances[Math.floor(garmentPixels / 2)];
  const explained = visibleBorder.filter((i) => distance[i] < opts.backgroundDeltaE).length;
  const signals: SegmentationSignals = {
    garmentShare: garmentPixels / n,
    borderTouch: border.filter((i) => mask[i] === 1).length / border.length,
    borderUniformity: visibleBorder.length === 0 ? 1 : explained / visibleBorder.length,
    separation,
  };
  return {
    ok: true,
    segmentation: {
      width,
      height,
      mask,
      garmentPixels,
      confidence: segmentationConfidence(signals, opts.backgroundDeltaE),
      signals,
    },
  };
}
