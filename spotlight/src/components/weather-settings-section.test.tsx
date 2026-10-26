import { fireEvent, render, screen } from '@testing-library/react-native';

import { WEATHER_SETTINGS_TEXT } from '@/data/weather-messages';

import { WeatherSettingsSection } from './weather-settings-section';

function renderSection(overrides: Partial<Parameters<typeof WeatherSettingsSection>[0]> = {}) {
  const props = {
    settings: { useLocalWeather: false, homeCity: null },
    onToggle: jest.fn(),
    cityText: '',
    onChangeCity: jest.fn(),
    onSaveCity: jest.fn(),
    ...overrides,
  };
  return render(<WeatherSettingsSection {...props} />).then(() => props);
}

describe('WeatherSettingsSection (rendered)', () => {
  it('shows the switch (off by default), what it uses, and the home city field', async () => {
    const props = await renderSection();
    expect(screen.getByText('Weather')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Use local weather' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText(WEATHER_SETTINGS_TEXT.toggleHint)).toBeTruthy();
    expect(screen.getByText(WEATHER_SETTINGS_TEXT.cityHint)).toBeTruthy();
    await fireEvent.press(toggle);
    expect(props.onToggle).toHaveBeenCalledWith(true);
  });

  it('edits the city and saves on leave or done', async () => {
    const props = await renderSection({ cityText: 'Oslo' });
    const field = screen.getByLabelText(/^Home city/);
    await fireEvent.changeText(field, 'Bergen');
    expect(props.onChangeCity).toHaveBeenCalledWith('Bergen');
    await fireEvent(field, 'blur');
    await fireEvent(field, 'submitEditing');
    expect(props.onSaveCity).toHaveBeenCalledTimes(2);
  });

  it('shows the city error and a save error', async () => {
    await renderSection({ cityError: WEATHER_SETTINGS_TEXT.cityTooLong, saveError: WEATHER_SETTINGS_TEXT.saveFailed });
    expect(screen.getByText(WEATHER_SETTINGS_TEXT.cityTooLong)).toBeTruthy();
    expect(screen.getByText(WEATHER_SETTINGS_TEXT.saveFailed)).toBeTruthy();
  });
});
