import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppearanceControl } from './appearance-control';
import { touchHeight } from './ui/testing/rendered-touch';

describe('AppearanceControl (rendered)', () => {
  it('is the "Theme" radio group with Light, Dark and System; the preference is checked', async () => {
    await render(<AppearanceControl value="system" onChange={() => {}} />);
    // The group is not itself focusable (that would merge the radios on iOS), so find it by label.
    expect(screen.getByLabelText('Theme').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual(['Light', 'Dark', 'System']);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    for (const radio of screen.getAllByRole('radio')) expect(touchHeight(radio)).toBeGreaterThanOrEqual(44);
  });

  it('reports the chosen preference', async () => {
    const onChange = jest.fn();
    await render(<AppearanceControl value="system" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
