/** TEST-ONLY builders for outfit requests: closet summaries and closet items. */
import { paletteColor } from '@/core/palette';
import type { Category, ClothingItem } from '@/core/types';

import type { ClosetItemSummary } from '../generate-outfits-contract';

/** A minimal valid summary. */
export function summary(id: string, category: Category, extra: Partial<ClosetItemSummary> = {}): ClosetItemSummary {
  return { id, category, colors: ['black'], seasons: ['spring'], ...extra };
}

/** A minimal valid closet item (one front photo, one color, one season, no tags). */
export function closetItem(id: string, category: Category, extra: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id,
    photos: [{ id: `${id}-photo`, role: 'front', path: `closet-images/${id}.jpg`, sortOrder: 0, isPrimary: true }],
    category,
    colors: [{ paletteId: 'black', hex: paletteColor('black')!.hex, source: 'user' }],
    seasons: ['spring'],
    tags: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

/** A closet with two tops, two bottoms, a dress, two pairs of shoes, a coat and an accessory. */
export function sampleSummaries(): ClosetItemSummary[] {
  return [
    summary('top-1', 'top'),
    summary('top-2', 'top'),
    summary('bottom-1', 'bottom'),
    summary('bottom-2', 'bottom'),
    summary('dress-1', 'dress'),
    summary('shoes-1', 'shoes'),
    summary('shoes-2', 'shoes'),
    summary('coat-1', 'outerwear'),
    summary('bag-1', 'accessory'),
  ];
}
