/**
 * Color conversions and perceptual distance. Pure math, no dependencies.
 *
 * sRGB hex <-> linear RGB <-> CIE XYZ (D65) <-> CIELAB (D65 white), and the
 * CIEDE2000 color difference (Sharma, Wu & Dalal 2005). Used to map a color
 * to the nearest palette entry (legacy hex values now, detected colors in
 * slice 4) and to decide when a swatch needs an outline.
 */
import { normalizeHex, PALETTE, type PaletteColor } from './palette';

/** Linear-light RGB, each channel 0..1 (may leave that range after conversions). */
export type LinearRgb = readonly [r: number, g: number, b: number];
export type Xyz = readonly [x: number, y: number, z: number];

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** D65 reference white (Y = 1), from the sRGB matrix below so white maps to a = b = 0. */
const WHITE: Xyz = [0.4124564 + 0.3575761 + 0.1804375, 1, 0.0193339 + 0.119192 + 0.9503041];

/** sRGB (IEC 61966-2-1) companding: encoded 0..1 -> linear 0..1. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Parses `#RGB` / `#RRGGBB` (any case). Throws on anything else. */
export function hexToLinearRgb(hex: string): LinearRgb {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error(`not a hex color: ${hex}`);
  const channel = (i: number) => toLinear(parseInt(normalized.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
  return [channel(0), channel(1), channel(2)];
}

/** Rounds to the nearest 8-bit sRGB color, clamping out-of-gamut values. Uppercase `#RRGGBB`. */
export function linearRgbToHex(rgb: LinearRgb): string {
  const byte = (c: number) => {
    const v = Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return `#${rgb.map(byte).join('')}`.toUpperCase();
}

export function linearRgbToXyz([r, g, b]: LinearRgb): Xyz {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

export function xyzToLinearRgb([x, y, z]: Xyz): LinearRgb {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

export function xyzToLab([x, y, z]: Xyz): Lab {
  const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x / WHITE[0]);
  const fy = f(y / WHITE[1]);
  const fz = f(z / WHITE[2]);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz({ L, a, b }: Lab): Xyz {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (f: number) => (f ** 3 > EPSILON ? f ** 3 : (116 * f - 16) / KAPPA);
  const yr = L > KAPPA * EPSILON ? fy ** 3 : L / KAPPA;
  return [inv(fx) * WHITE[0], yr * WHITE[1], inv(fz) * WHITE[2]];
}

export function hexToLab(hex: string): Lab {
  return xyzToLab(linearRgbToXyz(hexToLinearRgb(hex)));
}

export function labToHex(lab: Lab): string {
  return linearRgbToHex(xyzToLinearRgb(labToXyz(lab)));
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const POW25_7 = 25 ** 7;

/**
 * CIEDE2000 color difference with kL = kC = kH = 1, following Sharma, Wu &
 * Dalal (2005), including their notes on hue when a chroma is zero.
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const C1 = Math.hypot(lab1.a, lab1.b);
  const C2 = Math.hypot(lab2.a, lab2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + POW25_7)));
  const a1p = (1 + G) * lab1.a;
  const a2p = (1 + G) * lab2.a;
  const C1p = Math.hypot(a1p, lab1.b);
  const C2p = Math.hypot(a2p, lab2.b);
  const hueOf = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hueOf(lab1.b, a1p);
  const h2p = hueOf(lab2.b, a2p);

  const dLp = lab2.L - lab1.L;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (lab1.L + lab2.L) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + POW25_7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/** CIEDE2000 between two hex colors. */
export function hexDeltaE(hex1: string, hex2: string): number {
  return deltaE2000(hexToLab(hex1), hexToLab(hex2));
}

export interface PaletteMatch {
  color: PaletteColor;
  deltaE: number;
}

const PALETTE_LAB: readonly { color: PaletteColor; lab: Lab }[] = PALETTE.map((color) => ({
  color,
  lab: hexToLab(color.hex),
}));

/**
 * Every palette color with its CIEDE2000 distance from `hex`, closest first
 * (ties keep palette order). Slice 4 can turn the gap between the first two
 * into a confidence.
 */
export function rankPaletteColors(hex: string): PaletteMatch[] {
  const lab = hexToLab(hex);
  return PALETTE_LAB.map(({ color, lab: ref }) => ({ color, deltaE: deltaE2000(lab, ref) })).sort(
    (x, y) => x.deltaE - y.deltaE,
  );
}

/** The palette color perceptually closest to `hex` (CIEDE2000). Throws on a malformed hex. */
export function nearestPaletteColor(hex: string): PaletteColor {
  return rankPaletteColors(hex)[0].color;
}

/**
 * Below this CIEDE2000 distance from the background, a swatch is hard to see
 * (white or cream on a light screen, black or navy on a dark one) and gets a
 * strong outline.
 */
export const SWATCH_OUTLINE_DELTA_E = 30;

export function needsSwatchOutline(swatchHex: string, backgroundHex: string): boolean {
  return hexDeltaE(swatchHex, backgroundHex) < SWATCH_OUTLINE_DELTA_E;
}

/** sRGB byte (0..255) -> linear 0..1, precomputed: per-pixel work in slice 4 calls this ~10^4 times. */
const BYTE_TO_LINEAR: Float64Array = (() => {
  const table = new Float64Array(256);
  for (let i = 0; i < 256; i++) table[i] = toLinear(i / 255);
  return table;
})();

/** CIELAB of an 8-bit sRGB color (e.g. one decoded pixel). Same result as `hexToLab` for that color. */
export function srgbBytesToLab(r: number, g: number, b: number): Lab {
  return xyzToLab(linearRgbToXyz([BYTE_TO_LINEAR[r & 255], BYTE_TO_LINEAR[g & 255], BYTE_TO_LINEAR[b & 255]]));
}

/** Plain Euclidean distance in Lab (CIE76). Cheap; used for per-pixel work where CIEDE2000 is too slow. */
export function deltaE76(lab1: Lab, lab2: Lab): number {
  return Math.hypot(lab1.L - lab2.L, lab1.a - lab2.a, lab1.b - lab2.b);
}
