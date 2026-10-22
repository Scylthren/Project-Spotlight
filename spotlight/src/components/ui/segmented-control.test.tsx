import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from './segmented-control';
import { touchHeight } from './testing/rendered-touch';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl (rendered)', () => {
  it('is a named radio group of radios; only the value is checked and selected', async () => {
    await render(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} accessibilityLabel="Letters" />);
    // The group is not itself focusable (that would merge the radios on iOS), so find it by label.
    expect(screen.getByLabelText('Letters').props.accessibilityRole).toBe('radiogroup');
    const alpha = screen.getByRole('radio', { name: 'Alpha' });
    const beta = screen.getByRole('radio', { name: 'Beta' });
    expect(beta).toBeChecked();
    expect(beta).toBeSelected();
    expect(alpha).not.toBeChecked();
    expect(alpha).not.toBeSelected();
    for (const option of [alpha, beta]) expect(touchHeight(option)).toBeGreaterThanOrEqual(44);
  });

  it('reports the pressed option', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={OPTIONS} value="b" onChange={onChange} accessibilityLabel="Letters" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ignores presses when disabled', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={OPTIONS} value="b" onChange={onChange} accessibilityLabel="Letters" disabled />);
    const alpha = screen.getByRole('radio', { name: 'Alpha' });
    expect(alpha).toBeDisabled();
    await fireEvent.press(alpha);
    expect(onChange).not.toHaveBeenCalled();
  });
});
