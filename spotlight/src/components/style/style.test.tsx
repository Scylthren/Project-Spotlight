import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { closetItem } from '@/ai/testing/outfit-fixtures';
import { touchHeight } from '@/components/ui/testing/rendered-touch';
import type { LookPiece } from '@/core';
import { OUTFIT_FAILURES } from '@/ai/outfit-generator';
import { describeStyleFailure, STYLE_DATA_NOTICE, type StyleFailure } from '@/data/style-messages';
import type { LookbookSnapshot } from '@/data/lookbook-store';
import type { StyleLook, StyleSnapshot, StyleStatus } from '@/data/style-session';
import { MATCH_WEATHER_TEXT, WEATHER_RESULTS_TEXT } from '@/data/weather-messages';
import { contrastRatio, themes } from '@/theme';

import { LookCard, type LookSaveProps } from './look-card';
import { ResultsView } from './results-view';
import { StylePromptForm, type MatchWeatherRow } from './style-prompt-form';

const resolve = (ref: string) => `file:///${ref}`;

const WEATHER_OFF: MatchWeatherRow = { available: false, on: false, onChange: jest.fn(), onOpenMe: jest.fn() };

function Prompt({ recents = [], onSubmit = jest.fn(), weather = WEATHER_OFF }: { recents?: string[]; onSubmit?: () => void; weather?: MatchWeatherRow }) {
  const [text, setText] = useState('');
  const tooLong = [...text.trim()].length > 200;
  return (
    <StylePromptForm
      text={text}
      onChangeText={setText}
      error={tooLong ? 'Keep it to 200 characters.' : undefined}
      canSubmit={text.trim().length > 0 && !tooLong}
      onSubmit={onSubmit}
      recents={recents}
      weather={weather}
    />
  );
}

const field = () => screen.getByLabelText('Describe the look');
const getLooks = () => screen.getByRole('button', { name: 'Get looks' });

describe('StylePromptForm (rendered)', () => {
  it('shows the title, field, examples, the accent Get looks button and the exact notice', async () => {
    await render(<Prompt />);
    expect(screen.getByText('Style me')).toBeTruthy();
    expect(screen.getByText('occasion?')).toBeTruthy();
    expect(field()).toBeTruthy();
    for (const example of ['For summer', 'Emo vibes', 'First date', 'Job interview', 'Rainy day']) {
      expect(screen.getByRole('button', { name: example })).toBeTruthy();
    }
    expect(screen.getByText(STYLE_DATA_NOTICE)).toBeTruthy();
    expect(screen.getByText('0/200')).toBeTruthy();
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('Get looks is disabled until there is text, then sends', async () => {
    const onSubmit = jest.fn();
    await render(<Prompt onSubmit={onSubmit} />);
    expect(getLooks().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(getLooks());
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(field(), 'for a wedding');
    expect(screen.getByText('13/200')).toBeTruthy();
    await fireEvent.press(getLooks());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('the Get looks button is filled with the accent color and readable in both themes', async () => {
    await render(<Prompt />);
    const { buttonLook } = jest.requireActual('@/components/ui/button-style');
    for (const theme of Object.values(themes)) {
      const look = buttonLook(theme, 'accent', { pressed: false, disabled: false });
      expect(look.fill).toBe(theme.colors.accent);
      expect(contrastRatio(String(look.label.color), look.fill)).toBeGreaterThanOrEqual(4.5);
    }
    expect(touchHeight(getLooks())).toBeGreaterThanOrEqual(44);
  });

  it('an example chip fills the field and shows as selected', async () => {
    await render(<Prompt />);
    await fireEvent.press(screen.getByRole('button', { name: 'Emo vibes' }));
    expect(field().props.value).toBe('Emo vibes');
    expect(screen.getByRole('button', { name: 'Emo vibes' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'For summer' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('shows recent requests newest first; tapping one fills the field', async () => {
    await render(<Prompt recents={['Thrift-store chic for brunch', 'emo vibes']} />);
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('“Thrift-store chic for brunch”')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Thrift-store chic for brunch' }));
    expect(field().props.value).toBe('Thrift-store chic for brunch');
    expect(touchHeight(screen.getByRole('button', { name: 'emo vibes' }))).toBeGreaterThanOrEqual(44);
  });

  it('over 200 characters shows the error and disables Get looks', async () => {
    await render(<Prompt />);
    await fireEvent.changeText(field(), 'x'.repeat(201));
    expect(screen.getByText('Keep it to 200 characters.')).toBeTruthy();
    expect(screen.getByText('201/200')).toBeTruthy();
    expect(getLooks().props.accessibilityState).toMatchObject({ disabled: true });
  });
});

function look(overrides: Partial<StyleLook> = {}): StyleLook {
  const pieces: LookPiece[] = [
    { id: 't', category: 'top', item: closetItem('t', 'top', { name: 'Band hoodie' }) },
    { id: 'b', category: 'bottom', item: closetItem('b', 'bottom') },
    { id: 'c', category: 'outerwear', item: closetItem('c', 'outerwear') },
    { id: 's', category: 'shoes', item: closetItem('s', 'shoes') },
    { id: 'a', category: 'accessory', item: closetItem('a', 'accessory') },
  ];
  return {
    key: 'look-1',
    itemIds: pieces.map((p) => p.id),
    rationale: 'An all-dark palette keeps the graphic as the focus.',
    pieces,
    restyling: false,
    restyleNotice: null,
    model: 'claude-haiku-5-5',
    ...overrides,
  };
}

/** Save props for a look that is not saved, with fresh mocks. */
function unsaved(): LookSaveProps {
  return { saved: null, onSave: jest.fn(), onRate: jest.fn(), onPickOccasion: jest.fn(), saveError: null };
}

describe('LookCard (rendered)', () => {
  it('shows the number, "Look one of three", the pieces line and why it works', async () => {
    await render(<LookCard {...unsaved()} look={look()} position={1} total={3} resolveImageUri={resolve} onRestyle={jest.fn()} />);
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('Look one of three')).toBeTruthy();
    expect(screen.getByText('Band hoodie, Bottom, Outerwear, Shoes, Accessory.')).toBeTruthy();
    expect(screen.getByText(/Why it works/)).toBeTruthy();
    expect(screen.getByText(/An all-dark palette keeps the graphic as the focus\./)).toBeTruthy();
    // Slice 4 adds Save next to Restyle (slice 2 had none).
    expect(screen.getByRole('button', { name: 'Save look 1' })).toBeTruthy();
  });

  it('draws main pieces large and shoes and accessories small, each named for screen readers', async () => {
    const { theme } = { theme: themes.light };
    await render(<LookCard {...unsaved()} look={look()} position={1} total={1} resolveImageUri={resolve} onRestyle={jest.fn()} />);
    const tiles = screen.getAllByRole('image');
    expect(tiles.map((t) => t.props.accessibilityLabel)).toEqual(['Band hoodie', 'Bottom', 'Outerwear', 'Shoes', 'Accessory']);
    const heights = tiles.map((t) => [t.props.style].flat(3).reduce((h: number, s) => (s && 'height' in s ? s.height : h), 0));
    expect(heights.slice(0, 3)).toEqual([theme.sizes.lookPhotoHeightThree, theme.sizes.lookPhotoHeightThree, theme.sizes.lookPhotoHeightThree]);
    expect(heights.slice(3)).toEqual([theme.sizes.lookSmallPhotoSize, theme.sizes.lookSmallPhotoSize]);
  });

  it('shows a deleted piece as "Removed from closet"', async () => {
    const base = look();
    const pieces = base.pieces.map((p) => (p.id === 'b' ? { ...p, item: null } : p));
    await render(<LookCard {...unsaved()} look={{ ...base, pieces }} position={2} total={3} resolveImageUri={resolve} onRestyle={jest.fn()} />);
    expect(screen.getByText('Removed from closet')).toBeTruthy();
    expect(screen.getByText('Band hoodie, Removed from closet, Outerwear, Shoes, Accessory.')).toBeTruthy();
    expect(screen.getByText('Look two of three')).toBeTruthy();
  });

  it('Restyle calls back; while restyling it is disabled and says so; a notice shows under it', async () => {
    const onRestyle = jest.fn();
    const { rerender } = await render(<LookCard {...unsaved()} look={look()} position={1} total={3} resolveImageUri={resolve} onRestyle={onRestyle} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restyle look 1' }));
    expect(onRestyle).toHaveBeenCalledTimes(1);

    await rerender(<LookCard {...unsaved()} look={look({ restyling: true })} position={1} total={3} resolveImageUri={resolve} onRestyle={onRestyle} />);
    const busy = screen.getByRole('button', { name: 'Restyling look 1' });
    expect(screen.getByText('Restyling...')).toBeTruthy();
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(busy);
    expect(onRestyle).toHaveBeenCalledTimes(1);

    await rerender(
      <LookCard {...unsaved()} look={look({ restyleNotice: 'No other looks for this request' })} position={1} total={3} resolveImageUri={resolve} onRestyle={onRestyle} />,
    );
    expect(screen.getByText('No other looks for this request')).toBeTruthy();
  });
});

function snapshot(status: StyleStatus, request = 'Emo vibes', extra: Partial<StyleSnapshot> = {}): StyleSnapshot {
  return { request, matchWeather: false, weather: null, status, closed: false, ...extra };
}

async function renderResults(snap: StyleSnapshot | null, lookbook: Pick<LookbookSnapshot, 'looks' | 'error'> = { looks: [], error: null }) {
  const handlers = {
    onBack: jest.fn(),
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    onAddPiece: jest.fn(),
    onOpenMe: jest.fn(),
    onRestyle: jest.fn(),
    onSave: jest.fn(),
    onRate: jest.fn(),
    onPickOccasion: jest.fn(),
  };
  await render(<ResultsView snapshot={snap} resolveImageUri={resolve} lookbook={lookbook} bottomInset={0} {...handlers} />);
  return handlers;
}

describe('StylePromptForm: match today\'s weather (rendered)', () => {
  it('with Use local weather off, says how to turn it on and links to Me', async () => {
    const onOpenMe = jest.fn();
    await render(<Prompt weather={{ ...WEATHER_OFF, onOpenMe }} />);
    expect(screen.getByText(MATCH_WEATHER_TEXT.label)).toBeTruthy();
    expect(screen.getByText(MATCH_WEATHER_TEXT.offNote)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: MATCH_WEATHER_TEXT.openMe }));
    expect(onOpenMe).toHaveBeenCalled();
  });

  it('with it on, the row is a switch; when on, the text is optional and the forecast notice shows', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<Prompt weather={{ available: true, on: false, onChange, onOpenMe: jest.fn() }} />);
    await fireEvent.press(screen.getByRole('switch', { name: MATCH_WEATHER_TEXT.label }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText(MATCH_WEATHER_TEXT.dataNotice)).toBeNull();
    await rerender(<Prompt weather={{ available: true, on: true, onChange, onOpenMe: jest.fn() }} />);
    expect(screen.getByRole('switch', { name: MATCH_WEATHER_TEXT.label }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText(MATCH_WEATHER_TEXT.onHint)).toBeTruthy();
    expect(screen.getByText(MATCH_WEATHER_TEXT.dataNotice)).toBeTruthy();
    expect(screen.getByText(STYLE_DATA_NOTICE)).toBeTruthy();
  });
});

describe('ResultsView (rendered)', () => {
  it('loading: the request as title, a spinner and Cancel', async () => {
    const h = await renderResults(snapshot({ kind: 'loading' }));
    expect(screen.getByText('“Emo vibes”')).toBeTruthy();
    expect(screen.getByText('Finding looks in your closet...')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  it('ready: "N looks from your closet", numbered cards, Restyle per look', async () => {
    const looks = [look({ key: 'k1' }), look({ key: 'k2' }), look({ key: 'k3' })];
    const h = await renderResults(snapshot({ kind: 'ready', looks, omittedItems: 0 }));
    expect(screen.getByText('3 looks from your closet')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('Look three of three')).toBeTruthy();
    expect(screen.queryByText(/left out/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Restyle look 2' }));
    expect(h.onRestyle).toHaveBeenCalledWith('k2');
  });

  it('ready: a quiet line when pieces were left out', async () => {
    await renderResults(snapshot({ kind: 'ready', looks: [look()], omittedItems: 2 }));
    expect(screen.getByText('1 look from your closet')).toBeTruthy();
    expect(screen.getByText('2 pieces were left out of this request (closet limit or incomplete details).')).toBeTruthy();
  });

  it('ready with every look dropped: says the pieces were removed', async () => {
    const h = await renderResults(snapshot({ kind: 'ready', looks: [], omittedItems: 0 }));
    expect(screen.getByText('No looks left')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Change request' }));
    expect(h.onBack).toHaveBeenCalled();
  });

  it('empty: "No looks this time" with Try again', async () => {
    const h = await renderResults(snapshot({ kind: 'empty' }));
    expect(screen.getByText('No looks this time')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(h.onRetry).toHaveBeenCalledTimes(1);
  });

  it('not enough pieces: says what is missing and opens the Add tab', async () => {
    const h = await renderResults(snapshot({ kind: 'failed', failure: 'not-enough-items', missing: ['bottom', 'dress'] }));
    expect(screen.getByText('Not enough pieces')).toBeTruthy();
    expect(screen.getByText('Add a bottom, or a dress, to get looks.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a piece' }));
    expect(h.onAddPiece).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['offline', "You're offline", 'Try again'],
    ['no-token', 'Not connected', 'Try again'],
    ['not-configured', 'Not set up', 'Back'],
    ['timeout', 'That took too long', 'Try again'],
    ['rejected', "That request can't be sent", 'Change request'],
    ['server', 'Something went wrong', 'Try again'],
    ['closet-unavailable', "Couldn't read your closet", 'Try again'],
  ] as const)('failure %s: "%s" with %s', async (failure, title, action) => {
    await renderResults(snapshot({ kind: 'failed', failure, missing: [] }));
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByRole('button', { name: action })).toBeTruthy();
  });

  const ACTION_BUTTONS = { retry: 'Try again', 'add-piece': 'Add a piece', 'edit-request': 'Change request', 'open-me': 'Open Me', none: 'Back' } as const;

  it.each([...OUTFIT_FAILURES, 'closet-unavailable', 'weather-off', 'no-location', 'place-not-found'] as StyleFailure[])('every failure kind renders its words and button: %s', async (failure) => {
    const view = describeStyleFailure(failure, ['top', 'bottom', 'dress']);
    await renderResults(snapshot({ kind: 'failed', failure, missing: ['top', 'bottom', 'dress'] }));
    expect(screen.getByText(view.title)).toBeTruthy();
    expect(screen.getByText(view.body)).toBeTruthy();
    expect(screen.getByRole('button', { name: ACTION_BUTTONS[view.action] })).toBeTruthy();
  });

  it('weather: the line with the place and the Open-Meteo credit above the looks', async () => {
    const weather = { highC: 18, lowC: 9, rainChance: 60, windKph: 10, conditions: 'rain', intensity: 'light' } as const;
    await renderResults(
      snapshot({ kind: 'loading' }, '', { matchWeather: true, weather: { kind: 'used', weather, placeName: 'Leeds, United Kingdom' } }),
    );
    expect(screen.getByText(WEATHER_RESULTS_TEXT.title)).toBeTruthy();
    expect(screen.getByText('Leeds, United Kingdom · 64° / 48° · Light rain · 60% rain')).toBeTruthy();
    expect(screen.getByText('Weather data by Open-Meteo.com')).toBeTruthy();
    expect(screen.getByLabelText(/^Weather for Leeds, United Kingdom, high 64 degrees Fahrenheit/)).toBeTruthy();
  });

  it('weather: checking, then skipped says so plainly', async () => {
    await renderResults(snapshot({ kind: 'loading', phase: 'weather' }, 'office', { matchWeather: true }));
    expect(screen.getByText(WEATHER_RESULTS_TEXT.checking)).toBeTruthy();
    expect(screen.getByText('“office”')).toBeTruthy();
    await renderResults(snapshot({ kind: 'empty' }, 'office', { matchWeather: true, weather: { kind: 'skipped', failure: 'offline' } }));
    expect(screen.getByText(WEATHER_RESULTS_TEXT.skipped)).toBeTruthy();
    expect(screen.queryByText('Weather data by Open-Meteo.com')).toBeNull();
  });

  it('weather blocks: Open Me goes to the Me tab; the reason is in the body', async () => {
    const h = await renderResults(snapshot({ kind: 'failed', failure: 'no-location', missing: [], location: 'services-off' }, '', { matchWeather: true }));
    expect(screen.getByText('Location is off')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Me' }));
    expect(h.onOpenMe).toHaveBeenCalled();
    await renderResults(snapshot({ kind: 'failed', failure: 'place-not-found', missing: [], city: 'Qwx' }, '', { matchWeather: true }));
    expect(screen.getByText('No place matches “Qwx”. Check your home city on the Me tab.')).toBeTruthy();
  });

  it('cancelled: offers Try again', async () => {
    const h = await renderResults(snapshot({ kind: 'cancelled' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(h.onRetry).toHaveBeenCalled();
  });

  it('no session: says so; Back goes back', async () => {
    const h = await renderResults(null);
    expect(screen.getByText('Nothing to show')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Style' }));
    expect(h.onBack).toHaveBeenCalled();
  });
});
