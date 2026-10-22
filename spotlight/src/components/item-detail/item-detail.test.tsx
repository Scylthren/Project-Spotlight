import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchHeight } from '@/components/ui/testing/rendered-touch';
import type { ClothingItem, ItemPhoto } from '@/core';
import { contrastRatio, themes } from '@/theme';

import { angleTabAccessibility, angleTabLook, itemDetailLook } from './item-detail-style';
import { ItemDetailView } from './item-detail-view';

function photo(id: string, role: ItemPhoto['role'], sortOrder: number, isPrimary = false): ItemPhoto {
  return { id, role, path: `closet-images/${id}.jpg`, sortOrder, isPrimary };
}

const ITEM: ClothingItem = {
  id: 'item-1',
  photos: [photo('f', 'front', 0, true), photo('b', 'back', 1)],
  category: 'outerwear',
  colors: [
    { paletteId: 'navy', hex: '#202A60', source: 'user' },
    { paletteId: 'white', hex: '#FFFFFF', source: 'user' },
  ],
  seasons: ['winter', 'autumn'],
  tags: ['minimal'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function renderDetail(item: ClothingItem = ITEM) {
  const onBack = jest.fn();
  const onEdit = jest.fn();
  await render(
    <ItemDetailView
      item={item}
      resolveImageUri={(ref) => `file:///${ref}`}
      onBack={onBack}
      onEdit={onEdit}
      topInset={0}
      bottomInset={0}
    />,
  );
  return { onBack, onEdit };
}

const imageUri = () => {
  const source = screen.getByRole('image').props.source;
  return (Array.isArray(source) ? source[0] : source).uri;
};

describe('ItemDetailView (rendered)', () => {
  it('shows Gate 1 content read-only: title, colors, style tags and seasons', async () => {
    await renderDetail();
    expect(screen.getByRole('header', { name: 'Outerwear' })).toBeTruthy();
    expect(screen.getByLabelText('Colors: Navy (primary), White')).toBeTruthy();
    expect(screen.getByText('minimal')).toBeTruthy();
    expect(screen.getByLabelText('Seasons: Autumn, Winter')).toBeTruthy();
    expect(screen.getByText('Autumn · Winter')).toBeTruthy();
    expect(screen.queryByLabelText(/Delete/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('starts on the primary photo and switches angles with the tabs', async () => {
    await renderDetail();
    expect(imageUri()).toBe('file:///closet-images/f.jpg');
    expect(screen.getByRole('tab', { name: 'Front photo' })).toBeSelected();
    const back = screen.getByRole('tab', { name: 'Back photo' });
    expect(back).not.toBeSelected();
    expect(touchHeight(back)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(back);
    expect(imageUri()).toBe('file:///closet-images/b.jpg');
    expect(screen.getByRole('tab', { name: 'Back photo' })).toBeSelected();
    expect(screen.getByRole('image').props.accessibilityLabel).toBe('Back photo of the outerwear');
  });

  it('hides the angle tabs when there is only one photo', async () => {
    await renderDetail({ ...ITEM, photos: [photo('f', 'front', 0, true)] });
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('back and Edit are named 44 pt buttons', async () => {
    const { onBack, onEdit } = await renderDetail();
    const back = screen.getByRole('button', { name: 'Back' });
    const edit = screen.getByRole('button', { name: 'Edit item' });
    expect(touchHeight(back)).toBeGreaterThanOrEqual(44);
    expect(touchHeight(edit)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  ['light', themes.light],
  ['dark', themes.dark],
] as const)('item detail style (%s)', (_name, theme) => {
  it('angle labels are readable on the photo background; the selected one has the accent rule', () => {
    for (const selected of [false, true]) {
      const tab = angleTabLook(theme, selected);
      expect(contrastRatio(String(tab.label.color), theme.colors.photoBackground)).toBeGreaterThanOrEqual(4.5);
      expect(Number(tab.container.minHeight) + tab.hitSlop.top + tab.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    }
    expect(angleTabLook(theme, true).underline.borderBottomColor).toBe(theme.colors.accent);
    expect(angleTabAccessibility('Back', true)).toEqual({
      accessibilityRole: 'tab',
      accessibilityLabel: 'Back photo',
      accessibilityState: { selected: true },
    });
  });

  it('puts the photo area under the status bar and keeps text readable', () => {
    const look = itemDetailLook(theme, 47);
    expect(look.photoArea.height).toBe(theme.sizes.itemPhotoHeight + 47);
    expect(look.overlayButton.height).toBe(44);
    expect(contrastRatio(String(look.editLabel.color), String(look.overlayButton.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(String(look.seasonsText.color), String(look.seasons.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(look.title.fontFamily).toBe(theme.fonts.serif.regular);
  });
});

describe('ItemDetailView: attributes (Gate 2)', () => {
  it('shows the attributes under the title and names them for screen readers', async () => {
    await renderDetail({
      ...ITEM,
      name: 'Old coat',
      attributes: { type: { value: 'Trench', source: 'user' }, material: { value: 'wool', source: 'auto' } },
    });
    const line = screen.getByText('Outerwear · Trench · Wool');
    expect(line.props.accessibilityLabel).toBe('Outerwear, type Trench, material Wool');
  });

  it('an old item without attributes shows no attributes line', async () => {
    await renderDetail();
    expect(screen.queryByText(/·.*·/)).toBeNull();
  });
});

