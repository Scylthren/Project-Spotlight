/**
 * What the closet tiles and the read-only item screen show (Closet.dc.html,
 * ItemDetail.dc.html): name, category, photos, colors, seasons, style tags,
 * and (Gate 2) attributes. An item without a name is called by its category.
 */
import { describeItemColors } from './color-selection';
import { describeAttributes } from './item-attributes';
import { itemDisplayName } from './item-name';
import { CATEGORY_LABELS, SEASON_LABELS } from './labels';
import { paletteName } from './palette';
import { primaryPhoto } from './photo-set';
import { SEASONS, type ClothingItem, type ItemPhoto, type PhotoRole } from './types';

export interface ClosetTile {
  /** The serif label under the photo: the name, else the category ("Top"). */
  name: string;
  /** The line under it: "Navy, white"; for a named item the category first: "Top · Navy, white". */
  meta: string;
  /** Read for the whole tile: "Top, Navy, white" or "Black band hoodie, Top, Navy, white". */
  accessibilityLabel: string;
}

export function describeClosetTile(item: ClothingItem): ClosetTile {
  const name = itemDisplayName(item);
  const colors = describeItemColors(item.colors);
  if (item.name === undefined) {
    return { name, meta: colors, accessibilityLabel: colors ? `${name}, ${colors}` : name };
  }
  const category = CATEGORY_LABELS[item.category];
  return {
    name,
    meta: colors ? `${category} · ${colors}` : category,
    accessibilityLabel: [name, category, colors].filter((part) => part.length > 0).join(', '),
  };
}

/** One angle of the item screen's photo switcher. */
export interface PhotoAngle {
  photoId: string;
  role: PhotoRole;
  /** "Front", "Back", "Detail" (or "Detail 1", "Detail 2" when there are two). */
  label: string;
  path: string;
}

const ROLE_LABELS: Readonly<Record<PhotoRole, string>> = { front: 'Front', back: 'Back', detail: 'Detail' };

/** The item's photos in display order, labelled for the angle switcher. */
export function photoAngles(photos: readonly ItemPhoto[]): PhotoAngle[] {
  const ordered = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const details = ordered.filter((p) => p.role === 'detail').length;
  let detailIndex = 0;
  return ordered.map((photo) => {
    const numbered = photo.role === 'detail' && details > 1;
    const label = numbered ? `${ROLE_LABELS.detail} ${++detailIndex}` : ROLE_LABELS[photo.role];
    return { photoId: photo.id, role: photo.role, label, path: photo.path };
  });
}

/** The angle shown first: the primary photo (the one the grid shows), else the first. */
export function initialAngleId(photos: readonly ItemPhoto[]): string | null {
  return primaryPhoto(photos)?.id ?? photos[0]?.id ?? null;
}

/** The angle to show for `selectedId`, falling back to the initial one if it is gone. */
export function selectedAngle(angles: readonly PhotoAngle[], selectedId: string | null, photos: readonly ItemPhoto[]): PhotoAngle | null {
  return (
    angles.find((a) => a.photoId === selectedId) ??
    angles.find((a) => a.photoId === initialAngleId(photos)) ??
    angles[0] ??
    null
  );
}

export interface DetailColor {
  paletteId: string;
  name: string;
  hex: string;
  primary: boolean;
}

export interface ItemDetail {
  /** The name, else the category. */
  title: string;
  /**
   * The line under the title: a named item's category, then its attributes
   * ("Top · Hoodie · Graphic · Cotton · Oversized · Casual"); null when
   * there is nothing to add to the title.
   */
  subtitle: string | null;
  /** The subtitle for screen readers, naming each attribute: "Top, type Hoodie, fit Oversized". */
  subtitleAccessibilityLabel: string | null;
  colors: DetailColor[];
  /** "Colors: Navy (primary), White". */
  colorsAccessibilityLabel: string;
  /** "Autumn · Winter", in calendar order. */
  seasonsText: string;
  /** "Seasons: Autumn, Winter". */
  seasonsAccessibilityLabel: string;
  tags: string[];
}

export function describeItemDetail(item: ClothingItem): ItemDetail {
  const colors = item.colors.map((c, i) => ({
    paletteId: c.paletteId,
    name: paletteName(c.paletteId),
    hex: c.hex,
    primary: i === 0,
  }));
  const seasons = SEASONS.filter((s) => item.seasons.includes(s)).map((s) => SEASON_LABELS[s]);
  const category = item.name === undefined ? [] : [CATEGORY_LABELS[item.category]];
  const attributes = describeAttributes(item.attributes);
  const subtitle = [...category, ...attributes.map((a) => a.text)];
  const spoken = [...category, ...attributes.map((a) => `${a.label.toLowerCase()} ${a.text}`)];
  return {
    title: itemDisplayName(item),
    subtitle: subtitle.length > 0 ? subtitle.join(' · ') : null,
    subtitleAccessibilityLabel: spoken.length > 0 ? spoken.join(', ') : null,
    colors,
    colorsAccessibilityLabel: `Colors: ${colors.map((c) => (c.primary ? `${c.name} (primary)` : c.name)).join(', ')}`,
    seasonsText: seasons.join(' · '),
    seasonsAccessibilityLabel: `Seasons: ${seasons.join(', ')}`,
    tags: [...item.tags],
  };
}
