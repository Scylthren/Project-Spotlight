import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScreenHeader } from './screen-header';
import { touchHeight, touchWidth } from './testing/rendered-touch';

describe('ScreenHeader (rendered)', () => {
  it('masthead: the title is a header, with the note beside it', async () => {
    await render(<ScreenHeader title="Closet" aside="24 pieces" />);
    expect(screen.getByRole('header', { name: 'Closet' })).toBeTruthy();
    expect(screen.getByText('24 pieces')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('step: a named 44 pt back button that fires, a header title and the step in words', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader variant="step" title="New piece" onBack={onBack} step={{ current: 1, total: 2 }} />);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(touchHeight(back)).toBeGreaterThanOrEqual(44);
    expect(touchWidth(back)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'New piece' })).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 2')).toBeTruthy();
  });

  it('step without onBack has no back button', async () => {
    await render(<ScreenHeader variant="step" title="New piece" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
