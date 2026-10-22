import { render, screen } from '@testing-library/react-native';

import { SectionLabel } from './section-label';

describe('SectionLabel (rendered)', () => {
  it('is a header named by its text', async () => {
    await render(<SectionLabel>Colors</SectionLabel>);
    expect(screen.getByRole('header', { name: 'Colors' })).toBeTruthy();
  });
});
