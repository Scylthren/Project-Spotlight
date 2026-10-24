import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { closetItem } from '@/ai/testing/outfit-fixtures';
import { touchHeight } from '@/components/ui/testing/rendered-touch';
import { ALL_LOOKS_FILTER, lookbookEntries, type ClothingItem, type LookbookEntry, type LookbookFilter, type SavedLook } from '@/core';
import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';

import { LookbookView } from './lookbook-view';
import { SavedLookView } from './saved-look-view';

const resolve = (ref: string) => `file:///${ref}`;
const NOW = new Date(2026, 9, 24, 15);
const at = (day: number) => new Date(2026, 9, day, 12).toISOString();

const CLOSET: ClothingItem[] = [
  closetItem('top-1', 'top', { name: 'Band hoodie', seasons: ['summer', 'autumn'] }),
  closetItem('bottom-1', 'bottom', { seasons: ['summer'] }),
  closetItem('shoes-1', 'shoes', { seasons: ['summer', 'winter'] }),
  closetItem('coat', 'outerwear', { seasons: ['winter'] }),
];

function entriesOf(looks: SavedLook[], closet: ClothingItem[] = CLOSET): LookbookEntry[] {
  return lookbookEntries(looks, new Map(closet.map((i) => [i.id, i])));
}

const EMO = makeSavedLook({ id: 'emo', occasion: 'night-out', rating: 'up', createdAt: at(24) });
const RAIN = makeSavedLook({ id: 'rain', request: 'Rainy day', createdAt: at(20), pieces: [piece('coat', 'outerwear'), piece('shoes-1', 'shoes')] });

function Lookbook({ entries, onOpen = jest.fn() }: { entries: LookbookEntry[]; onOpen?: (id: string) => void }) {
  const [filter, setFilter] = useState<LookbookFilter>(ALL_LOOKS_FILTER);
  return (
    <LookbookView
      status="ready"
      entries={entries}
      filter={filter}
      onFilter={setFilter}
      onOpen={onOpen}
      onGetLooks={jest.fn()}
      resolveImageUri={resolve}
      bottomInset={0}
      now={NOW}
    />
  );
}

describe('LookbookView (rendered)', () => {
  it('shows "Lookbook", "N saved", the chips, and one row per look with request, date, occasion and rating', async () => {
    await render(<Lookbook entries={entriesOf([EMO, RAIN])} />);
    expect(screen.getByText('Lookbook')).toBeTruthy();
    expect(screen.getByText('2 saved')).toBeTruthy();
    const chips = ['All', 'Night out', 'Summer', 'Winter'];
    for (const chip of chips) expect(screen.getByRole('button', { name: chip })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Autumn' })).toBeNull();
    expect(screen.getByText('“Emo vibes”')).toBeTruthy();
    expect(screen.getByText('Oct 24 · Night out · Liked')).toBeTruthy();
    expect(screen.getByText('“Rainy day”')).toBeTruthy();
    expect(screen.getByText('Oct 20')).toBeTruthy();
  });

  it('filters by occasion and season', async () => {
    await render(<Lookbook entries={entriesOf([EMO, RAIN])} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Night out' }));
    expect(screen.getByText('“Emo vibes”')).toBeTruthy();
    expect(screen.queryByText('“Rainy day”')).toBeNull();
    expect(screen.getByRole('button', { name: 'Night out' }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Winter' }));
    expect(screen.queryByText('“Emo vibes”')).toBeNull();
    expect(screen.getByText('“Rainy day”')).toBeTruthy();
  });

  it('a filter whose last look is deleted falls back to All', async () => {
    const { rerender } = await render(<Lookbook entries={entriesOf([EMO, RAIN])} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Night out' }));
    await rerender(<Lookbook entries={entriesOf([RAIN])} />);
    expect(screen.queryByRole('button', { name: 'Night out' })).toBeNull();
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('“Rainy day”')).toBeTruthy();
    // The forgotten filter does not come back when a night-out look is saved again.
    await rerender(<Lookbook entries={entriesOf([EMO, RAIN])} />);
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('a season edit after saving moves the look between season chips', async () => {
    const { rerender } = await render(<Lookbook entries={entriesOf([RAIN])} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Winter' }));
    expect(screen.getByText('“Rainy day”')).toBeTruthy();
    const edited = CLOSET.map((i) => (i.id === 'coat' ? { ...i, seasons: ['summer' as const] } : i));
    await rerender(<Lookbook entries={entriesOf([RAIN], edited)} />);
    expect(screen.queryByRole('button', { name: 'Winter' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Summer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('a row opens its look and is a 44 pt target; deleted pieces show as removed (D5)', async () => {
    const onOpen = jest.fn();
    const withoutTop = CLOSET.filter((i) => i.id !== 'top-1');
    await render(<Lookbook entries={entriesOf([EMO], withoutTop)} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: '“Emo vibes”, Oct 24 · Night out · Liked' });
    expect(touchHeight(row)).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('Removed')).toBeTruthy();
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith('emo');
  });

  it('shows at most four photos per row and counts the rest', async () => {
    const big = makeSavedLook({
      id: 'big',
      pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom'), piece('coat', 'outerwear'), piece('shoes-1', 'shoes'), piece('bag', 'accessory'), piece('hat', 'accessory')],
    });
    await render(<Lookbook entries={entriesOf([big])} />);
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('renders many saved looks without trouble (FlatList renders a window)', async () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      makeSavedLook({ id: `l${i}`, request: `Request ${i}`, createdAt: new Date(2026, 0, 1, 0, i).toISOString() }),
    );
    await render(<Lookbook entries={entriesOf(many)} />);
    expect(screen.getByText('500 saved')).toBeTruthy();
    expect(screen.getByText('“Request 0”')).toBeTruthy();
    expect(screen.queryByText('“Request 499”')).toBeNull();
  });

  it('empty, loading and failed states', async () => {
    const onGetLooks = jest.fn();
    const props = { filter: ALL_LOOKS_FILTER, onFilter: jest.fn(), onOpen: jest.fn(), resolveImageUri: resolve, bottomInset: 0, now: NOW };
    const { rerender } = await render(<LookbookView {...props} status="ready" entries={[]} onGetLooks={onGetLooks} />);
    expect(screen.getByText('No saved looks yet')).toBeTruthy();
    expect(screen.getByText('0 saved')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Get looks' }));
    expect(onGetLooks).toHaveBeenCalled();
    await rerender(<LookbookView {...props} status="loading" entries={[]} />);
    expect(screen.getByLabelText('Loading saved looks')).toBeTruthy();
    await rerender(<LookbookView {...props} status="failed" entries={[]} />);
    expect(screen.getByText('Could not load your saved looks.')).toBeTruthy();
  });
});

describe('SavedLookView (rendered)', () => {
  function renderLook(entry: LookbookEntry | null, status: 'loading' | 'ready' | 'failed' = 'ready', error: string | null = null) {
    const handlers = { onBack: jest.fn(), onRate: jest.fn(), onPickOccasion: jest.fn(), onDelete: jest.fn() };
    return render(
      <SavedLookView status={status} entry={entry} now={NOW} resolveImageUri={resolve} error={error} bottomInset={0} {...handlers} />,
    ).then(() => handlers);
  }

  it('shows the request, date and seasons, photos, pieces, why it works, rating and occasion', async () => {
    await renderLook(entriesOf([EMO])[0]);
    expect(screen.getByText('“Emo vibes”')).toBeTruthy();
    expect(screen.getByText('Saved Oct 24 · Summer')).toBeTruthy();
    expect(screen.getByText('Band hoodie, Bottom, Shoes.')).toBeTruthy();
    expect(screen.getByText(/An all-dark palette/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thumbs up for this look' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'Night out' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('rates, picks an occasion, deletes and goes back through its handlers', async () => {
    const h = await renderLook(entriesOf([EMO])[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Thumbs down for this look' }));
    expect(h.onRate).toHaveBeenCalledWith('down');
    await fireEvent.press(screen.getByRole('button', { name: 'Travel' }));
    expect(h.onPickOccasion).toHaveBeenCalledWith('travel');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete look' }));
    expect(h.onDelete).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Lookbook' }));
    expect(h.onBack).toHaveBeenCalled();
  });

  it('a removed piece reads "Removed from closet" (D5)', async () => {
    await renderLook(entriesOf([EMO], CLOSET.filter((i) => i.id !== 'bottom-1'))[0]);
    expect(screen.getByText('Band hoodie, Removed from closet, Shoes.')).toBeTruthy();
  });

  it('a look that is gone, loading or failed says so; an error shows', async () => {
    await renderLook(null);
    expect(screen.getByText('This look is no longer in your Lookbook.')).toBeTruthy();
    await renderLook(null, 'failed');
    expect(screen.getByText('Could not load this look.')).toBeTruthy();
    await renderLook(entriesOf([EMO])[0], 'ready', 'Could not change this look. Try again.');
    expect(screen.getByText('Could not change this look. Try again.')).toBeTruthy();
  });
});
