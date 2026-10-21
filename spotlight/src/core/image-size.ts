/** Pixel dimensions of an image. */
export interface ImageSize {
  width: number;
  height: number;
}

/** Longest edge, in pixels, of a photo stored in the closet. */
export const MAX_STORED_IMAGE_EDGE = 1600;

/**
 * Size to scale `size` to so its longest edge is at most `maxEdge`, keeping
 * the aspect ratio. Never upscales: an image already within the limit comes
 * back unchanged. The shorter edge is rounded and never drops below 1px.
 * Throws on non-finite or non-positive input.
 */
export function fitWithinMaxEdge(size: ImageSize, maxEdge: number = MAX_STORED_IMAGE_EDGE): ImageSize {
  const { width, height } = size;
  for (const [name, value] of [['width', width], ['height', height], ['maxEdge', maxEdge]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got ${value}`);
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return width >= height
    ? { width: maxEdge, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: maxEdge };
}

/** True if `fitWithinMaxEdge` would change the size. */
export function needsDownscale(size: ImageSize, maxEdge: number = MAX_STORED_IMAGE_EDGE): boolean {
  return Math.max(size.width, size.height) > maxEdge;
}
