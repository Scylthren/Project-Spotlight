import { fireEvent, render, screen } from '@testing-library/react-native';

import { applyAttributeSuggestions, EMPTY_ATTRIBUTE_FIELDS, EMPTY_ITEM_FORM, type AttributeFields as Fields } from '@/core';
import type { ItemFormFields } from '@/hooks/use-item-form-fields';

import { AttributeFields } from './attribute-fields';
import { touchHeight } from './ui/testing/rendered-touch';

/** Just the parts of the form fields `AttributeFields` uses. */
function fakeFields(attributes: Fields, suggestingTags = false, noSuggestions = false) {
  const fields = {
    values: { ...EMPTY_ITEM_FORM, attributes },
    suggestingTags,
    noSuggestions,
    setItemType: jest.fn(),
    toggleAttribute: jest.fn(),
  };
  return fields as typeof fields & ItemFormFields;
}

const SUGGESTED = applyAttributeSuggestions(EMPTY_ATTRIBUTE_FIELDS, {
  type: 'Shirt',
  pattern: 'striped',
  material: 'cotton',
  fit: 'regular',
  formality: 'smart-casual',
});

describe('AttributeFields (rendered)', () => {
  it('shows suggested values marked "Suggested", and says so to screen readers', async () => {
    await render(<AttributeFields fields={fakeFields(SUGGESTED)} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Pattern, Striped, suggested' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Material, Cotton, suggested' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fit, Regular, suggested' })).toBeTruthy();
    expect(screen.getByDisplayValue('Shirt')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Smart casual' })).toBeChecked();
    // Pattern, material, fit, type and formality each say "Suggested".
    expect(screen.getAllByText('Suggested')).toHaveLength(5);
  });

  it('changes a choice in two taps: open the box, pick a value (which closes the choices)', async () => {
    const fields = fakeFields(SUGGESTED);
    await render(<AttributeFields fields={fields} disabled={false} />);
    expect(screen.queryByLabelText('Pattern choices')).toBeNull();
    const box = screen.getByRole('button', { name: 'Pattern, Striped, suggested' });
    expect(touchHeight(box)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(box);
    expect(screen.getByLabelText('Pattern choices')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Striped' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Polka dot' }));
    expect(fields.toggleAttribute).toHaveBeenCalledWith('pattern', 'polka-dot');
    expect(screen.queryByLabelText('Pattern choices')).toBeNull();
  });

  it('lists every material and fit, and a second tap on the box closes its choices', async () => {
    await render(<AttributeFields fields={fakeFields(EMPTY_ATTRIBUTE_FIELDS)} disabled={false} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Material, not set' }));
    for (const label of ['Cotton', 'Denim', 'Wool', 'Knit', 'Linen', 'Silk', 'Leather', 'Synthetic', 'Other']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Fit, not set' }));
    expect(screen.queryByLabelText('Material choices')).toBeNull();
    expect(screen.getByLabelText('Fit choices')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Fit, not set' }));
    expect(screen.queryByLabelText('Fit choices')).toBeNull();
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('sets formality in one tap and the type by typing', async () => {
    const fields = fakeFields(EMPTY_ATTRIBUTE_FIELDS);
    await render(<AttributeFields fields={fields} disabled={false} />);
    const athletic = screen.getByRole('radio', { name: 'Athletic' });
    expect(touchHeight(athletic)).toBeGreaterThanOrEqual(44);
    await fireEvent.press(athletic);
    expect(fields.toggleAttribute).toHaveBeenCalledWith('formality', 'athletic');
    await fireEvent.changeText(screen.getByLabelText('Type'), 'Hoodie');
    expect(fields.setItemType).toHaveBeenCalledWith('Hoodie');
  });

  it('tells screen readers the chosen formality clears on a second tap', async () => {
    const fields = fakeFields({
      ...EMPTY_ATTRIBUTE_FIELDS,
      formality: { value: 'casual', source: 'user' },
    });
    await render(<AttributeFields fields={fields} disabled={false} />);
    const casual = screen.getByRole('radio', { name: 'Casual' });
    expect(casual.props.accessibilityHint).toBe('Tap again to clear it');
    expect(screen.getByRole('radio', { name: 'Athletic' }).props.accessibilityHint).toBeUndefined();
    await fireEvent.press(casual);
    expect(fields.toggleAttribute).toHaveBeenCalledWith('formality', 'casual');
  });

  it('shows a hint while suggesting, and locks everything while busy', async () => {
    const fields = fakeFields(EMPTY_ATTRIBUTE_FIELDS, true);
    await render(<AttributeFields fields={fields} disabled />);
    expect(screen.getByText('Suggesting details from the photo...')).toBeTruthy();
    const box = screen.getByRole('button', { name: 'Pattern, not set' });
    expect(box).toBeDisabled();
    await fireEvent.press(box);
    expect(screen.queryByLabelText('Pattern choices')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Formal' }));
    expect(fields.toggleAttribute).not.toHaveBeenCalled();
  });

  it('says "No suggestions" quietly when tagging gave nothing, and nothing once it is not the case', async () => {
    const view = await render(<AttributeFields fields={fakeFields(EMPTY_ATTRIBUTE_FIELDS, false, true)} disabled={false} />);
    expect(screen.getByText('No suggestions')).toBeTruthy();
    expect(screen.queryByText('Suggesting details from the photo...')).toBeNull();
    // Fields stay usable: the user fills them in.
    expect(screen.getByRole('button', { name: 'Pattern, not set' })).not.toBeDisabled();
    await view.rerender(<AttributeFields fields={fakeFields(EMPTY_ATTRIBUTE_FIELDS, true, false)} disabled={false} />);
    expect(screen.queryByText('No suggestions')).toBeNull();
    expect(screen.getByText('Suggesting details from the photo...')).toBeTruthy();
  });
});
