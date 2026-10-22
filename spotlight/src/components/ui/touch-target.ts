import { sizes } from '@/theme';

export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const grow = (side: number | undefined, min: number) =>
  side === undefined ? 0 : Math.max(0, Math.ceil((min - side) / 2));

/**
 * Hit slop that grows a control drawn smaller than the minimum touch target
 * (44 pt) up to it, split evenly on both sides. Pass `width` only for
 * controls whose width is fixed; text-sized ones are wide enough.
 */
export function hitSlopFor(
  { height, width }: { height: number; width?: number },
  min: number = sizes.minTouchTarget,
): HitSlop {
  const vertical = grow(height, min);
  const horizontal = grow(width, min);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

/** The touchable size of a control: its drawn size plus its hit slop. */
export function touchArea(
  { height, width }: { height: number; width: number },
  slop: HitSlop | undefined,
): { height: number; width: number } {
  return {
    height: height + (slop?.top ?? 0) + (slop?.bottom ?? 0),
    width: width + (slop?.left ?? 0) + (slop?.right ?? 0),
  };
}
