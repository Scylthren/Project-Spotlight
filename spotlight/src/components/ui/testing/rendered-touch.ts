import { StyleSheet } from 'react-native';

interface HostElement {
  props: { style?: unknown; hitSlop?: { top?: number; bottom?: number; left?: number; right?: number } };
}

/** The vertical touch reach of a rendered host element: drawn minHeight/height plus hit slop. */
export function touchHeight(el: HostElement): number {
  const style = (StyleSheet.flatten(el.props.style as never) ?? {}) as { minHeight?: number; height?: number };
  const drawn = Math.max(style.minHeight ?? 0, style.height ?? 0);
  return drawn + (el.props.hitSlop?.top ?? 0) + (el.props.hitSlop?.bottom ?? 0);
}

/** The horizontal touch reach (fixed width plus hit slop); 0 for text-sized controls. */
export function touchWidth(el: HostElement): number {
  const style = (StyleSheet.flatten(el.props.style as never) ?? {}) as { width?: number };
  return (style.width ?? 0) + (el.props.hitSlop?.left ?? 0) + (el.props.hitSlop?.right ?? 0);
}
