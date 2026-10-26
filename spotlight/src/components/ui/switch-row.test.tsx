import { fireEvent, render, screen } from '@testing-library/react-native';

import { themes } from '@/theme';

import { SwitchRow } from './switch-row';
import { switchRowLook } from './switch-row-style';

describe('SwitchRow', () => {
  it('is one switch for screen readers; a tap on the row toggles it', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Use local weather" value={false} onValueChange={onValueChange} />);
    const row = screen.getByRole('switch', { name: 'Use local weather' });
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(row);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="X" value onValueChange={onValueChange} disabled />);
    await fireEvent.press(screen.getByRole('switch', { name: 'X' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('is at least the touch target tall, accent or ink when on', () => {
    for (const theme of Object.values(themes)) {
      const look = switchRowLook(theme, 'accent', { pressed: false, disabled: false });
      expect(look.row.minHeight).toBeGreaterThanOrEqual(theme.sizes.minTouchTarget);
      expect(look.trackOn).toBe(theme.colors.accent);
      expect(switchRowLook(theme, 'ink', { pressed: false, disabled: false }).trackOn).toBe(theme.colors.text);
    }
  });
});
