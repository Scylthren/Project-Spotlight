import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ClosetGrid } from '@/components/closet-grid';
import { touchHeight } from '@/components/ui/testing/rendered-touch';
import { filterCloset, NO_CLOSET_FILTER, noMatchesMessage, type ClosetFilter, type ClothingItem } from '@/core';
import { contrastRatio, themes } from '@/theme';

import { ClosetFilterBar } from './closet-filter-bar';
import { closetCellWidth, closetGridLook, closetTileBackground } from './closet-grid-style';

function item(id: string, overrides: Partial<ClothingItem>): ClothingItem {
  return {
    id,
    photos: [{ id: `${id}-p`, role: 'front', path: `${id}.jpg`, sortOrder: 0, isPrimary: true }],
    category: 'top',
    colors: [{ paletteId: 'navy', hex: '#202A60', source: 'user' }],
    seasons: ['summer'],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const TOP = item('top-1', { tags: ['preppy'] });
const BOOTS = item('boots-1', { category: 'shoes', colors: [{ paletteId: 'black', hex: '#111111', source: 'user' }], tags: ['emo'] });

/** The closet screen's filter state wiring, without the router and the database. */
function FilteredCloset({ items, onPressItem = () => {} }: { items: ClothingItem[]; onPressItem?: (i: ClothingItem) => void }) {
  const [filter, setFilter] = useState<ClosetFilter>(NO_CLOSET_FILTER);
  return (
    <>
      <ClosetFilterBar filter={filter} onChange={setFilter} />
      <ClosetGrid
        items={filterCloset(items, filter)}
        resolveImageUri={(ref) => `file:///${ref}`}
        onPressItem={onPressItem}
        emptyMessage={noMatchesMessage(filter)}
      />
    </>
  );
}

describe('ClosetGrid (rendered)', () => {
  it('names each tile by category and colors, and opens the item on press', async () => {
    const onPressItem = jest.fn();
    await render(<FilteredCloset items={[TOP, BOOTS]} onPressItem={onPressItem} />);
    const tile = screen.getByRole('button', { name: 'Shoes, Black' });
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Navy')).toBeTruthy();
    await fireEvent.press(tile);
    expect(onPressItem).toHaveBeenCalledWith(BOOTS);
  });
});

describe('ClosetFilterBar (rendered)', () => {
  it('has a named search box and an All chip selected first, with 44 pt targets', async () => {
    await render(<FilteredCloset items={[TOP, BOOTS]} />);
    expect(screen.getByLabelText('Search your closet')).toBeTruthy();
    expect(screen.queryByText('Search your closet')).toBeNull();
    const all = screen.getByRole('button', { name: 'All' });
    expect(all).toBeSelected();
    expect(touchHeight(all)).toBeGreaterThanOrEqual(44);
    for (const name of ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories']) {
      expect(screen.getByRole('button', { name })).not.toBeSelected();
    }
  });

  it('filters by category chip, and All brings everything back', async () => {
    await render(<FilteredCloset items={[TOP, BOOTS]} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Shoes' }));
    expect(screen.getByRole('button', { name: 'Shoes' })).toBeSelected();
    expect(screen.queryByRole('button', { name: 'Top, Navy' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Shoes, Black' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Top, Navy' })).toBeTruthy();
  });

  it('searches, combines with the category, and says when nothing matches', async () => {
    await render(<FilteredCloset items={[TOP, BOOTS]} />);
    await fireEvent.changeText(screen.getByLabelText('Search your closet'), 'EMO');
    expect(screen.getByRole('button', { name: 'Shoes, Black' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Top, Navy' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tops' }));
    expect(screen.queryByRole('button', { name: 'Shoes, Black' })).toBeNull();
    expect(screen.getByText('No tops match "EMO".')).toBeTruthy();
    expect(screen.queryByText('Your closet is empty.')).toBeNull();
  });
});

describe.each([
  ['light', themes.light],
  ['dark', themes.dark],
] as const)('closet grid style (%s)', (_name, theme) => {
  it('splits the width into two equal columns inside the screen padding', () => {
    const width = closetCellWidth(theme, 390);
    expect(width * 2 + theme.spacing.md).toBeLessThanOrEqual(390 - 2 * theme.sizes.screenPadding);
    expect(width).toBe(169);
    expect(closetCellWidth(theme, 2000)).toBe(closetCellWidth(theme, theme.sizes.maxContentWidth));
  });

  it('alternates the two photo backgrounds like a checkerboard', () => {
    const bg = [0, 1, 2, 3].map((i) => closetTileBackground(theme, i));
    expect(bg).toEqual([
      theme.colors.photoBackground,
      theme.colors.photoBackgroundAlt,
      theme.colors.photoBackgroundAlt,
      theme.colors.photoBackground,
    ]);
  });

  it('uses the serif for names and readable secondary text; pressed tiles dim', () => {
    const look = closetGridLook(theme);
    expect(look.name.fontFamily).toBe(theme.fonts.serif.regular);
    expect(look.photo.height).toBe(theme.sizes.closetTileHeight);
    expect(contrastRatio(String(look.meta.color), theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(closetGridLook(theme, { pressed: true }).cell.opacity).toBe(theme.opacity.pressed);
  });
});
