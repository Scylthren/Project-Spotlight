/**
 * Measures a garment's main colors from its pixels (slice 4). Pure and
 * deterministic: the same pixels always give the same colors.
 *
 * 1. Takes the garment pixels from the mask (alpha below the threshold is
 *    ignored), eroded by one pixel when enough remain, so edge pixels blended
 *    with the backdrop do not count. Large garments are subsampled with a
 *    fixed stride.
 * 2. k-means in CIELAB (k = 5) with k-means++ seeding from a fixed-seed PRNG.
 * 3. Clusters whose centers are within `mergeDeltaE` (CIEDE2000) are merged:
 *    they are usually the same fabric in light and shadow.
 * 4. Each cluster maps to its nearest palette color (CIEDE2000); clusters
 *    mapping to the same palette color merge. The biggest is the primary;
 *    up to two more follow if each covers at least `minSecondaryShare`.
 * 5. Each color's hex is the measured center, not the palette's reference.
 *
 * Confidence per color: the isolation confidence, scaled down when the
 * measured color sits far from its palette color (clarity) and when the kept
 * colors cover little of the garment (a busy print).
 */
import { deltaE2000, labToHex, rankPaletteColors, srgbBytesToLab, type Lab } from './color-science';
import type { DetectedColor } from './color-selection';
import { isValidRgbaImage, SEGMENTATION_DEFAULTS, type RgbaImage } from './garment-segmentation';
import { MAX_ITEM_COLORS } from './color-selection';
import type { PaletteId } from './palette';

export interface ColorExtractionOptions {
  alphaThreshold: number;
  /** Number of k-means clusters. */
  k: number;
  maxIterations: number;
  /** Pixels used at most (stride subsampling above this). */
  maxSamples: number;
  /** Fewer garment pixels than this: no result. */
  minPixels: number;
  /** Clusters closer than this (CIEDE2000) are merged before palette matching. */
  mergeDeltaE: number;
  /** A secondary color must cover at least this share of the garment. */
  minSecondaryShare: number;
  /** PRNG seed for k-means++. */
  seed: number;
}

export const COLOR_EXTRACTION_DEFAULTS: Readonly<ColorExtractionOptions> = Object.freeze({
  alphaThreshold: SEGMENTATION_DEFAULTS.alphaThreshold,
  k: 5,
  maxIterations: 20,
  maxSamples: 4000,
  minPixels: 16,
  mergeDeltaE: 10,
  minSecondaryShare: 0.1,
  seed: 0x5eed,
});

export interface ExtractedColor {
  paletteId: PaletteId;
  /** Measured color, uppercase `#RRGGBB`. */
  hex: string;
  /** Share of garment pixels, 0..1. */
  share: number;
  /** CIEDE2000 from the measured color to its palette color. */
  paletteDeltaE: number;
  confidence: number;
}

export type ColorExtractionResult = { ok: true; colors: ExtractedColor[] } | { ok: false; reason: 'too_few_pixels' };

/** mulberry32: small, fast, deterministic PRNG returning 0..1. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface WeightedLab extends Lab {
  weight: number;
}

const sq = (p: Lab, q: Lab) => (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;

/** k-means in Lab. Returns the non-empty clusters with their pixel counts, biggest first. */
export function kMeansLab(points: readonly Lab[], k: number, maxIterations: number, seed: number): WeightedLab[] {
  if (points.length === 0) return [];
  const random = seededRandom(seed);
  // k-means++ seeding.
  const centers: Lab[] = [{ ...points[Math.floor(random() * points.length)] }];
  const nearest = points.map((p) => sq(p, centers[0]));
  while (centers.length < k) {
    const total = nearest.reduce((s, d) => s + d, 0);
    if (total === 0) break; // every point already sits on a center
    let target = random() * total;
    let index = 0;
    while (index < points.length - 1 && target >= nearest[index]) {
      target -= nearest[index];
      index += 1;
    }
    const center = { ...points[index] };
    centers.push(center);
    for (let i = 0; i < points.length; i++) nearest[i] = Math.min(nearest[i], sq(points[i], center));
  }

  const assignment = new Int32Array(points.length).fill(-1);
  const sums = centers.map(() => ({ L: 0, a: 0, b: 0, weight: 0 }));
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = sq(points[i], centers[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        changed = true;
      }
    }
    for (const s of sums) s.L = s.a = s.b = s.weight = 0;
    for (let i = 0; i < points.length; i++) {
      const s = sums[assignment[i]];
      s.L += points[i].L;
      s.a += points[i].a;
      s.b += points[i].b;
      s.weight += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s.weight > 0) centers[c] = { L: s.L / s.weight, a: s.a / s.weight, b: s.b / s.weight };
    }
    if (!changed) break;
  }
  return centers
    .map((c, i) => ({ ...c, weight: sums[i].weight }))
    .filter((c) => c.weight > 0)
    .sort((x, y) => y.weight - x.weight);
}

/** Weighted mean of two Lab clusters. */
function mergeInto(target: WeightedLab, other: WeightedLab): void {
  const weight = target.weight + other.weight;
  target.L = (target.L * target.weight + other.L * other.weight) / weight;
  target.a = (target.a * target.weight + other.a * other.weight) / weight;
  target.b = (target.b * target.weight + other.b * other.weight) / weight;
  target.weight = weight;
}

/** Garment pixel indices; eroded by one pixel if at least 40% (and `minPixels`) survive. */
function garmentIndices(image: RgbaImage, mask: Uint8Array, alphaThreshold: number, minPixels: number): number[] {
  const { width, height, data } = image;
  const inside = (i: number) => mask[i] === 1 && data[i * 4 + 3] >= alphaThreshold;
  const all: number[] = [];
  const eroded: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (!inside(i)) continue;
    all.push(i);
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
      if (inside(i - 1) && inside(i + 1) && inside(i - width) && inside(i + width)) eroded.push(i);
    }
  }
  return eroded.length >= Math.max(minPixels, 0.4 * all.length) ? eroded : all;
}

/**
 * The garment's colors, most prominent first (at most MAX_ITEM_COLORS).
 * `mask` has one byte per pixel (1 = garment). `isolationConfidence` (0..1)
 * comes from the isolator and caps every color's confidence.
 */
export function extractGarmentColors(
  image: RgbaImage,
  mask: Uint8Array,
  isolationConfidence: number,
  overrides: Partial<ColorExtractionOptions> = {},
): ColorExtractionResult {
  const opts = { ...COLOR_EXTRACTION_DEFAULTS, ...overrides };
  if (!isValidRgbaImage(image) || mask.length !== image.width * image.height) {
    return { ok: false, reason: 'too_few_pixels' };
  }
  const indices = garmentIndices(image, mask, opts.alphaThreshold, opts.minPixels);
  if (indices.length < opts.minPixels) return { ok: false, reason: 'too_few_pixels' };

  const stride = Math.max(1, Math.ceil(indices.length / opts.maxSamples));
  const points: Lab[] = [];
  for (let s = 0; s < indices.length; s += stride) {
    const o = indices[s] * 4;
    points.push(srgbBytesToLab(image.data[o], image.data[o + 1], image.data[o + 2]));
  }

  // Shading variants of one color merge first (biggest absorbs).
  const clusters: WeightedLab[] = [];
  for (const c of kMeansLab(points, opts.k, opts.maxIterations, opts.seed)) {
    const home = clusters.find((h) => deltaE2000(h, c) < opts.mergeDeltaE);
    if (home) mergeInto(home, c);
    else clusters.push({ ...c });
  }

  // Then clusters that name the same palette color.
  const byPalette = new Map<PaletteId, WeightedLab>();
  for (const c of clusters) {
    const id = rankPaletteColors(labToHex(c))[0].color.id;
    const existing = byPalette.get(id);
    if (existing) mergeInto(existing, c);
    else byPalette.set(id, { ...c });
  }

  const total = points.length;
  const ranked = [...byPalette.values()].sort((x, y) => y.weight - x.weight);
  const kept = ranked.filter((c, rank) => rank === 0 || c.weight / total >= opts.minSecondaryShare).slice(0, MAX_ITEM_COLORS);
  const coverage = kept.reduce((s, c) => s + c.weight, 0) / total;
  const coverageFactor = 0.6 + 0.4 * Math.min(1, Math.max(0, (coverage - 0.5) / 0.3));
  const isolation = Math.min(1, Math.max(0, Number.isFinite(isolationConfidence) ? isolationConfidence : 0));

  const colors = kept.map((c): ExtractedColor => {
    const hex = labToHex(c);
    // Palette color of the merged center (normally the same id it was filed under).
    const match = rankPaletteColors(hex)[0];
    const clarity = 1 - Math.min(1, Math.max(0, (match.deltaE - 6) / 18));
    return {
      paletteId: match.color.id,
      hex,
      share: c.weight / total,
      paletteDeltaE: match.deltaE,
      confidence: isolation * (0.6 + 0.4 * clarity) * coverageFactor,
    };
  });
  // A merged center can land on a neighbor's palette color: keep the first of each.
  const unique = colors.filter((c, i) => colors.findIndex((d) => d.paletteId === c.paletteId) === i);
  return { ok: true, colors: unique };
}

/** The form's input format (`prefillDetectedColors`). */
export function toDetectedColors(colors: readonly ExtractedColor[]): DetectedColor[] {
  return colors.map((c) => ({ paletteId: c.paletteId, hex: c.hex, confidence: c.confidence }));
}
