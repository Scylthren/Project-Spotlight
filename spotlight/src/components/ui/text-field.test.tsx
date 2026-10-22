import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

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

  // Spec change (human decision 2026-10-22, slice 4): the error is part of the field's name, not only its hint.
  it('shows the error, reads it as part of the field name, and draws the danger edge', async () => {
    await render(<TextField label="Name" value="" onChangeText={() => {}} error="Enter a name." hint="Short" />);
    expect(screen.getByText('Enter a name.')).toBeTruthy();
    expect(screen.queryByText('Short')).toBeNull();
    const input = screen.getByLabelText('Name, error: Enter a name.');
    expect(input.props.accessibilityHint).toBeUndefined();
    expect(input).toHaveStyle({ borderColor: themes.light.colors.danger });
  });

  it('announces an error when it appears or changes, not on re-render or when it clears', async () => {
    // jest-expo already mocks this; spyOn returns that mock, so clear calls from earlier tests.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    try {
      const field = (error?: string, value = '') => (
        <TextField label="Name" value={value} onChangeText={() => {}} error={error} />
      );
      const view = await render(field());
      expect(announce).not.toHaveBeenCalled();
      await view.rerender(field('Enter a name.'));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenLastCalledWith('Name, error: Enter a name.');
      await view.rerender(field('Enter a name.', 'a'));
      expect(announce).toHaveBeenCalledTimes(1);
      await view.rerender(field('Too long.', 'a'));
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith('Name, error: Too long.');
      await view.rerender(field(undefined, 'a'));
      expect(announce).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Name')).toBeTruthy();
      await view.rerender(field('Too long.', 'a'));
      expect(announce).toHaveBeenCalledTimes(3);
    } finally {
      announce.mockRestore();
    }
  });

  it('can hide the visible label and stay named by it', async () => {
    await render(<TextField label="Search your closet" labelHidden value="" onChangeText={() => {}} />);
    expect(screen.queryByText('Search your closet')).toBeNull();
    expect(screen.getByLabelText('Search your closet')).toBeTruthy();
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
