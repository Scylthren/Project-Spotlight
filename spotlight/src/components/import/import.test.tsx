import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

import type { TagOutcome } from '@/ai/closet-tagger';
import { FakeClosetTagger } from '@/ai/closet-tagger';
import { PHOTO_UPLOAD_NOTICE } from '@/core';
import { NoGarmentIsolator } from '@/data/garment-isolator';
import { FakeImageProcessor } from '@/data/image-processor';
import { ImportSession, type ImportDraft } from '@/data/import-session';
import { InMemoryClosetRepository } from '@/data/in-memory-closet-repository';
import { MemoryImageStore } from '@/data/memory-image-store';
import { RecordingTemporaryFiles } from '@/data/temporary-files';
import { FixedTagImageSource } from '@/data/testing/fixed-tag-image-source';
import { useImportDraftFields } from '@/hooks/use-import-draft-fields';
import { themes } from '@/theme';

import { touchHeight } from '../ui/testing/rendered-touch';
import { discardImportText } from './discard-import-text';
import { ImportDraftForm } from './import-draft-form';
import { ImportDraftRow } from './import-draft-row';
import { ImportEntry } from './import-entry';

const TOP: TagOutcome = {
  ok: true,
  stub: false,
  tags: {
    category: 'top',
    colors: ['black'],
    seasons: ['summer'],
    type: 'T-shirt',
    pattern: null,
    material: null,
    fit: null,
    formality: null,
  },
};

function makeSession(count: number, outcomes: TagOutcome[] = []) {
  const tagger = new FakeClosetTagger();
  tagger.queue.push(...outcomes);
  let next = 0;
  const session = new ImportSession(
    Array.from({ length: count }, (_, i) => ({ uri: `file:///cache/p${i + 1}.jpg`, width: 10, height: 10, assetId: null })),
    {
      tagger,
      imageSource: new FixedTagImageSource(),
      isolator: new NoGarmentIsolator(),
      addItem: {
        repository: new InMemoryClosetRepository(),
        imageStore: new MemoryImageStore(),
        imageProcessor: new FakeImageProcessor(),
        temporaryFiles: new RecordingTemporaryFiles(),
      },
      newId: () => `id-${++next}`,
      concurrency: 1,
    },
  );
  return session;
}

function row(draft: ImportDraft, overrides: Partial<Parameters<typeof ImportDraftRow>[0]> = {}) {
  const props = { draft, position: 2, total: 5, first: false, disabled: false, onOpen: jest.fn(), onRemove: jest.fn(), ...overrides };
  return { props, element: <ImportDraftRow {...props} /> };
}

describe('ImportDraftRow (rendered)', () => {
  it('shows a waiting draft with its position and no "needs" warning yet', async () => {
    const session = makeSession(1);
    await render(row(session.getSnapshot().drafts[0]).element);
    expect(screen.getByText('Photo 2 of 5')).toBeTruthy();
    expect(screen.getByText('No category yet')).toBeTruthy();
    expect(screen.getByText('Waiting for suggestions')).toBeTruthy();
    expect(screen.queryByText(/^Needs/)).toBeNull();
  });

  it('shows a suggested draft with its details and colors, ready to save', async () => {
    const session = makeSession(1, [TOP]);
    await session.start();
    await render(row(session.getSnapshot().drafts[0]).element);
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('T-shirt')).toBeTruthy();
    expect(screen.getByText('Black')).toBeTruthy();
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.queryByText(/^Needs/)).toBeNull();
  });

  it('says in red what a draft without suggestions needs', async () => {
    const session = makeSession(1, [{ ok: false, failure: 'no-token' }]);
    await session.start();
    await render(row(session.getSnapshot().drafts[0]).element);
    expect(screen.getByText('No suggestions')).toBeTruthy();
    const needs = screen.getByText('Needs a color, a category and a season');
    expect(StyleSheet.flatten(needs.props.style).color).toBe(themes.light.colors.danger);
    expect(screen.getByRole('button', { name: /Photo 2 of 5, No category yet, No suggestions, Needs a color/ })).toBeTruthy();
  });

  it('shows why a save failed', async () => {
    const session = makeSession(1, [TOP]);
    await session.start();
    const draft: ImportDraft = { ...session.getSnapshot().drafts[0], save: { status: 'failed', errors: ['Could not save the item. Please try again.'] } };
    await render(row(draft).element);
    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(screen.getByText('Could not save the item. Please try again.')).toBeTruthy();
  });

  it('opens and removes through 44 pt buttons, and locks them while saving', async () => {
    const session = makeSession(1);
    const { props, element } = row(session.getSnapshot().drafts[0]);
    const view = await render(element);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit photo 2' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Photo 2 of 5/ }));
    expect(props.onOpen).toHaveBeenCalledTimes(2);
    const remove = screen.getByRole('button', { name: 'Remove photo 2 from the import' });
    expect(touchHeight(remove)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(remove);
    expect(props.onRemove).toHaveBeenCalledTimes(1);
    await view.rerender(row(session.getSnapshot().drafts[0], { ...props, disabled: true }).element);
    expect(screen.getByRole('button', { name: 'Remove photo 2 from the import' })).toBeDisabled();
  });
});

/** The draft form wired to a real session, as the draft screen does. */
function DraftFormHarness({ session, id }: { session: ImportSession; id: string }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const draft = snapshot.drafts.find((d) => d.id === id)!;
  const fields = useImportDraftFields(session, draft);
  return (
    <ImportDraftForm
      draft={draft}
      fields={fields}
      savedTags={{ tags: [], error: null }}
      onDeleteSavedTag={jest.fn()}
      disabled={snapshot.saving}
    />
  );
}

describe('ImportDraftForm (rendered with a session)', () => {
  it('lets the user fill a draft without suggestions until nothing is missing', async () => {
    const session = makeSession(1, [{ ok: false, failure: 'offline' }]);
    await session.start();
    const id = session.getSnapshot().drafts[0].id;
    await render(<DraftFormHarness session={session} id={id} />);
    expect(screen.getByText('Needs a color, a category and a season before it can be saved.')).toBeTruthy();
    expect(screen.getByText('No suggestions')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Outerwear' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Winter' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Optional, e.g. Black band hoodie'), 'Rain jacket');
    expect(screen.getByText('Needs a color before it can be saved.')).toBeTruthy();
    await act(async () => {
      session.changeColors(id, () => ({ ok: true, colors: [{ paletteId: 'navy', hex: '#202A60', source: 'user' }] }));
    });
    expect(screen.queryByText(/before it can be saved/)).toBeNull();

    const draft = session.draft(id)!;
    expect(draft.categorySeason.category).toEqual({ value: 'outerwear', source: 'user' });
    expect(draft.categorySeason.seasons).toEqual({ value: ['winter'], source: 'user' });
    expect(draft.name).toBe('Rain jacket');
  });

  it('marks suggested values and lets the user change them', async () => {
    const session = makeSession(1, [TOP]);
    await session.start();
    const id = session.getSnapshot().drafts[0].id;
    await render(<DraftFormHarness session={session} id={id} />);
    expect(screen.getByRole('button', { name: 'Top' })).toBeSelected();
    expect(screen.getAllByText('Suggested').length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Bottom' }));
    expect(session.draft(id)!.categorySeason.category).toEqual({ value: 'bottom', source: 'user' });
    await fireEvent.press(screen.getByRole('button', { name: 'Pattern, not set' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Checked' }));
    expect(session.draft(id)!.attributes.pattern).toEqual({ value: 'checked', source: 'user' });
  });
});

describe('ImportEntry (rendered)', () => {
  it('offers the import with the limit, and shows a pick problem', async () => {
    const onImport = jest.fn();
    const view = await render(<ImportEntry onImport={onImport} disabled={false} problem={null} />);
    expect(screen.getByText(/Choose up to 20 photos/)).toBeTruthy();
    expect(screen.getByText(PHOTO_UPLOAD_NOTICE)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Import from library' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    await view.rerender(
      <ImportEntry onImport={onImport} disabled problem={{ message: 'Could not open your photos: boom', suggestSettings: true }} />,
    );
    expect(screen.getByText('Could not open your photos: boom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import from library' })).toBeDisabled();
  });
});

describe('discardImportText', () => {
  it('says how many unsaved photos would be dropped', () => {
    expect(discardImportText(1).detail).toBe('1 photo has not been saved and will be dropped. Pieces you already saved stay in your closet.');
    expect(discardImportText(4).detail).toMatch(/^4 photos have not been saved/);
  });
});
