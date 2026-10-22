import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from './chip';
import { CHIP_VARIANTS } from './chip-style';
import { touchHeight } from './testing/rendered-touch';

describe('Chip (rendered)', () => {
  it.each(CHIP_VARIANTS)('%s is a named button that fires onPress, with a 44 pt target', async (variant) => {
    const onPress = jest.fn();
    await render(<Chip variant={variant} label="Tops" onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Tops' });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(touchHeight(chip)).toBeGreaterThanOrEqual(44);
  });

  it('reports selected for plain and style-tag chips, never for the add chip', async () => {
    await render(
      <>
        <Chip label="All" selected onPress={() => {}} />
        <Chip variant="styleTag" label="minimal" selected onPress={() => {}} />
        <Chip variant="styleTag" label="romantic" onPress={() => {}} />
        <Chip variant="add" label="New tag" selected onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'minimal' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'romantic' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'New tag' })).not.toBeSelected();
    expect(screen.getByText('+ New tag')).toBeTruthy();
  });

  it('reports disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Tops" onPress={onPress} disabled />);
    const chip = screen.getByRole('button', { name: 'Tops' });
    expect(chip).toBeDisabled();
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('without onPress is static text, not a button', async () => {
    await render(<Chip variant="styleTag" label="minimal" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('minimal').props.accessibilityRole).toBe('text');
  });
});
