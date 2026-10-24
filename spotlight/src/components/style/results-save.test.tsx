import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';

import { closetItem } from '@/ai/testing/outfit-fixtures';
import { touchHeight } from '@/components/ui/testing/rendered-touch';
import { savedLookKey, type LookPiece } from '@/core';
import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';
import { InMemoryOutfitRepository } from '@/data/in-memory-outfit-repository';
import { LookbookStore, styleLookToSave } from '@/data/lookbook-store';
import type { StyleLook, StyleSnapshot } from '@/data/style-session';

import { LookCard } from './look-card';
import { ResultsView } from './results-view';

const resolve = (ref: string) => `file:///${ref}`;

function look(key: string, ids: [string, string]): StyleLook {
  const pieces: LookPiece[] = [
    { id: ids[0], category: 'top', item: closetItem(ids[0], 'top') },
    { id: ids[1], category: 'bottom', item: closetItem(ids[1], 'bottom') },
  ];
  return { key, itemIds: ids, rationale: 'Works.', pieces, restyling: false, restyleNotice: null, model: 'claude-haiku-5-5' };
}

const LOOK_1 = look('k1', ['top-1', 'bottom-1']);
const LOOK_2 = look('k2', ['top-2', 'bottom-2']);
const SNAPSHOT: StyleSnapshot = { request: 'Emo vibes', closed: false, status: { kind: 'ready', looks: [LOOK_1, LOOK_2], omittedItems: 0 } };

/** Results wired to a real LookbookStore over the in-memory repository, as the screen does it. */
function Harness({ store }: { store: LookbookStore }) {
  const lookbook = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <ResultsView
      snapshot={SNAPSHOT}
      resolveImageUri={resolve}
      lookbook={lookbook}
      bottomInset={0}
      onBack={jest.fn()}
      onCancel={jest.fn()}
      onRetry={jest.fn()}
      onAddPiece={jest.fn()}
      onRestyle={jest.fn()}
      onSave={(l) => void store.save(styleLookToSave(SNAPSHOT.request, l))}
      onRate={(l, rating) => void store.rateUnsavedOrSaved(styleLookToSave(SNAPSHOT.request, l), rating)}
      onPickOccasion={(saved, occasion) => void store.toggleOccasion(saved.id, occasion)}
    />
  );
}

async function setup(initial = [] as ReturnType<typeof makeSavedLook>[]) {
  const repository = new InMemoryOutfitRepository(initial);
  let n = 0;
  const store = new LookbookStore({ repository, newId: () => `saved-${++n}`, now: () => new Date('2026-10-24T12:00:00Z') });
  await store.load();
  await render(<Harness store={store} />);
  return { repository, store };
}

/** Lets the store's queued writes finish and React re-render. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('Results: Save, thumbs and occasion (rendered, real store)', () => {
  it('Save stores the look with the request and turns into "Saved"; a second tap keeps one entry', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Save look 1' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Look 1 saved' })).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Look 1 saved' }));
    await settle();
    const saved = await repository.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ request: 'Emo vibes', rationale: 'Works.', model: 'claude-haiku-5-5', rating: null, occasion: null });
    expect(saved[0].pieces).toEqual([piece('top-1', 'top'), piece('bottom-1', 'bottom')]);
    // Only the saved look shows the occasion chips; look 2 is still unsaved.
    expect(screen.getAllByText('Occasion')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save look 2' })).toBeTruthy();
  });

  it('rating an unsaved look saves it with that rating and no occasion (human decision)', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Thumbs down for look 2' }));
    await settle();
    expect(await repository.list()).toEqual([
      expect.objectContaining({ rating: 'down', occasion: null, pieces: [piece('top-2', 'top'), piece('bottom-2', 'bottom')] }),
    ]);
    expect(screen.getByRole('button', { name: 'Look 2 saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thumbs down for look 2' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Not for me')).toBeTruthy();
  });

  it('tapping the same thumb again clears the rating and keeps the look saved', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Thumbs up for look 1' }));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Thumbs up for look 1' }));
    await settle();
    const saved = await repository.list();
    expect(saved).toHaveLength(1);
    expect(saved[0].rating).toBeNull();
    expect(screen.getByRole('button', { name: 'Look 1 saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thumbs up for look 1' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('picks an occasion once saved, and tapping it again clears it', async () => {
    const { repository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Save look 1' }));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Night out' }));
    await settle();
    expect((await repository.list())[0].occasion).toBe('night-out');
    expect(screen.getByRole('button', { name: 'Night out' }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Night out' }));
    await settle();
    expect((await repository.list())[0].occasion).toBeNull();
  });

  it('a look saved earlier (same pieces, other request) shows as Saved with its rating', async () => {
    await setup([makeSavedLook({ id: 'old', request: 'Other', rating: 'up', pieces: [piece('bottom-1', 'bottom'), piece('top-1', 'top')] })]);
    expect(screen.getByRole('button', { name: 'Look 1 saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thumbs up for look 1' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('a failed save says so under that look only', async () => {
    const { repository } = await setup();
    repository.save = () => Promise.reject(new Error('disk'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save look 2' }));
    await settle();
    expect(screen.getAllByText('Could not save this look. Try again.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save look 2' })).toBeTruthy();
  });
});

describe('LookCard save controls', () => {
  it('thumbs are at least 44 pt and report their state; the hint says rating saves an unsaved look', async () => {
    await render(
      <LookCard
        look={LOOK_1}
        position={1}
        total={1}
        resolveImageUri={resolve}
        onRestyle={jest.fn()}
        saved={null}
        onSave={jest.fn()}
        onRate={jest.fn()}
        onPickOccasion={jest.fn()}
        saveError={null}
      />,
    );
    const up = screen.getByRole('button', { name: 'Thumbs up for look 1' });
    expect(touchHeight(up)).toBeGreaterThanOrEqual(44);
    expect(up.props.accessibilityHint).toMatch(/Saves the look/);
    expect(screen.getByText('Rate this look')).toBeTruthy();
    expect(screen.queryByText('Occasion')).toBeNull();
    expect(savedLookKey(LOOK_1.itemIds)).toBe('["bottom-1","top-1"]');
  });
});
