/**
 * TEST-ONLY synthetic RGBA images for the garment segmentation and color
 * tests: a "garment" rectangle on a backdrop, built in code.
 */
import type { RgbaImage } from '../garment-segmentation';

export type Rgba = readonly [r: number, g: number, b: number, a?: number];

export function rgb(hex: string, alpha = 255): Rgba {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, alpha];
}

/** An image whose pixel (x, y) is `paint(x, y)`. */
export function paintImage(width: number, height: number, paint: (x: number, y: number) => Rgba): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return { width, height, data };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The default garment box: the middle of a 96x128 frame, about 30% of it. */
export const GARMENT_BOX: Box = { x0: 24, y0: 24, x1: 72, y1: 104 };

export function inBox(x: number, y: number, box: Box = GARMENT_BOX): boolean {
  return x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
}

/** A 96x128 photo: `garment(x, y)` inside `box`, `background(x, y)` elsewhere. */
export function garmentPhoto(
  garment: (x: number, y: number) => Rgba,
  background: (x: number, y: number) => Rgba,
  box: Box = GARMENT_BOX,
  width = 96,
  height = 128,
): RgbaImage {
  return paintImage(width, height, (x, y) => (inBox(x, y, box) ? garment(x, y) : background(x, y)));
}

/** Deterministic per-pixel noise in -amount..amount (like sensor noise and JPEG artifacts). */
export function jitter(color: Rgba, x: number, y: number, amount: number): Rgba {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const n = Math.round((h - Math.floor(h) - 0.5) * 2 * amount);
  const c = (v: number) => Math.min(255, Math.max(0, v + n));
  return [c(color[0]), c(color[1]), c(color[2]), color[3] ?? 255];
}

/** Intersection over union of a mask with a box. */
export function maskBoxIoU(mask: Uint8Array, width: number, box: Box = GARMENT_BOX): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < mask.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const a = mask[i] === 1;
    const b = inBox(x, y, box);
    if (a && b) inter += 1;
    if (a || b) union += 1;
  }
  return union === 0 ? 0 : inter / union;
}
