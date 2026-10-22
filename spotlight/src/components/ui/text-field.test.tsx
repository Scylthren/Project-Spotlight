import { fireEvent, render, screen } from '@testing-library/react-native';

import { themes } from '@/theme';

import { TextField } from './text-field';
import { TEXT_FIELD_VARIANTS } from './text-field-style';
import { touchHeight } from './testing/rendered-touch';

describe('TextField (rendered)', () => {
  it.each(TEXT_FIELD_VARIANTS)('%s: the input is named by its label, reports typing, and is 44 pt tall', async (variant) => {
    const onChangeText = jest.fn();
    await render(<TextField variant={variant} label="Name" value="" onChangeText={onChangeText} />);
    const input = screen.getByLabelText('Name');
    await fireEvent.changeText(input, 'Coat');
    expect(onChangeText).toHaveBeenCalledWith('Coat');
    expect(touchHeight(input)).toBeGreaterThanOrEqual(44);
  });

  it('shows the error, reads it as the hint, and draws the danger edge', async () => {
    await render(<TextField label="Name" value="" onChangeText={() => {}} error="Enter a name." hint="Short" />);
    expect(screen.getByText('Enter a name.')).toBeTruthy();
    expect(screen.queryByText('Short')).toBeNull();
    const input = screen.getByLabelText('Name');
    expect(input.props.accessibilityHint).toBe('Error: Enter a name.');
    expect(input).toHaveStyle({ borderColor: themes.light.colors.danger });
  });

  it('turns the boxed edge ink while focused', async () => {
    await render(<TextField label="Search" value="" onChangeText={() => {}} />);
    const input = screen.getByLabelText('Search');
    expect(input).toHaveStyle({ borderColor: themes.light.colors.inputBorder });
    await fireEvent(input, 'focus');
    expect(screen.getByLabelText('Search')).toHaveStyle({ borderColor: themes.light.colors.text });
  });

  it('is not editable and reports disabled when disabled', async () => {
    await render(<TextField label="Name" value="x" onChangeText={() => {}} disabled />);
    const input = screen.getByLabelText('Name');
    expect(input.props.editable).toBe(false);
    expect(input.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
