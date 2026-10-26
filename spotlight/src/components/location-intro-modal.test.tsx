import { fireEvent, render, screen } from '@testing-library/react-native';

import { LOCATION_INTRO } from '@/data/weather-messages';

import { LocationIntroModal } from './location-intro-modal';

describe('LocationIntroModal (rendered)', () => {
  it('explains, then Allow or Not now; no "Don\'t Allow" button', async () => {
    const intro = { visible: true, requesting: false, allow: jest.fn(), notNow: jest.fn() };
    await render(<LocationIntroModal intro={intro} />);
    expect(screen.getByText(LOCATION_INTRO.title)).toBeTruthy();
    expect(screen.getByText(LOCATION_INTRO.body)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: LOCATION_INTRO.allow }));
    await fireEvent.press(screen.getByRole('button', { name: LOCATION_INTRO.notNow }));
    expect(intro.allow).toHaveBeenCalled();
    expect(intro.notNow).toHaveBeenCalled();
    expect(screen.queryByText(/Don.t Allow/)).toBeNull();
  });

  it('waits while the system prompt is up', async () => {
    await render(<LocationIntroModal intro={{ visible: true, requesting: true, allow: jest.fn(), notNow: jest.fn() }} />);
    expect(screen.getByText('Waiting...')).toBeTruthy();
  });
});
