import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeOverride } from '@/hooks/theme-override';
import { themes } from '@/theme';

import { Button } from './button';
import { BUTTON_VARIANTS } from './button-style';
import { touchHeight } from './testing/rendered-touch';

describe('Button (rendered)', () => {
  it.each(BUTTON_VARIANTS)('%s is a named button that fires onPress, with a 44 pt target', async (variant) => {
    const onPress = jest.fn();
    await render(<Button variant={variant} label="Save" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).not.toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(touchHeight(button)).toBeGreaterThanOrEqual(44);
  });

  it('reports disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses the accessibility label override and follows a dark override', async () => {
    await render(
      <ThemeOverride scheme="dark">
        <Button label="Go" accessibilityLabel="Generate outfit" onPress={() => {}} />
      </ThemeOverride>,
    );
    const button = screen.getByRole('button', { name: 'Generate outfit' });
    expect(button).toHaveStyle({ backgroundColor: themes.dark.colors.text });
  });
});
