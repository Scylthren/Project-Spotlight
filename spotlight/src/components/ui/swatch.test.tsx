import { fireEvent, render, screen } from '@testing-library/react-native';

import { paletteColor } from '@/core/palette';

import { Swatch } from './swatch';
import { touchHeight } from './testing/rendered-touch';

const cream = paletteColor('cream')!;

describe('Swatch (rendered)', () => {
  it('shows the color name as text', async () => {
    await render(<Swatch hex={cream.hex} name={cream.name} />);
    expect(screen.getByText('Cream')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pressable: a named button reporting selected, with a 44 pt target', async () => {
    const onPress = jest.fn();
    await render(<Swatch hex={cream.hex} name={cream.name} selected onPress={onPress} />);
    const swatch = screen.getByRole('button', { name: 'Cream' });
    expect(swatch).toBeSelected();
    expect(touchHeight(swatch)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(swatch);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Swatch hex={cream.hex} name={cream.name} onPress={onPress} disabled />);
    const swatch = screen.getByRole('button', { name: 'Cream' });
    expect(swatch).toBeDisabled();
    expect(swatch).not.toBeSelected();
    await fireEvent.press(swatch);
    expect(onPress).not.toHaveBeenCalled();
  });
});
