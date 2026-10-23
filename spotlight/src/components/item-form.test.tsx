import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { StyleSheet, type TextInputInstance } from 'react-native';

import { CAMERA_ACCESS_TEXT, INITIAL_CAMERA_ACCESS, PHOTO_UPLOAD_NOTICE, type CameraAccessState } from '@/core';
import type { CameraAccess } from '@/hooks/use-camera-access';
import { contrastRatio, themes } from '@/theme';

import { CameraDeniedPanel } from './camera-denied-panel';
import { CameraIntroModal } from './camera-intro-modal';
import { ChipGroup } from './chip-group';
import { colorMatrixLook, COLOR_MATRIX_COLUMNS } from './color-matrix-style';
import { FormButton, formButtonLook } from './form-button';
import { SourceButtons } from './photo-set-field';
import { angleTileWidth } from './item-form-style';
import { Chip, TextField } from './ui';
import { touchHeight } from './ui/testing/rendered-touch';

const styleOf = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

function camera(state: Partial<CameraAccessState>): CameraAccess {
  return {
    state: { ...INITIAL_CAMERA_ACCESS, ...state },
    takePhoto: jest.fn(async () => null),
    allow: jest.fn(),
    notNow: jest.fn(),
    chooseLibrary: jest.fn(),
    openSettings: jest.fn(),
    introClosed: jest.fn(),
  };
}

describe('FormButton', () => {
  it.each(['primary', 'secondary', 'destructive', 'text'] as const)(
    '%s is a named button with a 44 pt target that reports disabled',
    async (variant) => {
      const onPress = jest.fn();
      const view = await render(<FormButton label="Save changes" variant={variant} onPress={onPress} />);
      const button = screen.getByRole('button', { name: 'Save changes' });
      await fireEvent.press(button);
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(touchHeight(button)).toBeGreaterThanOrEqual(44);
      await view.rerender(<FormButton label="Save changes" variant={variant} onPress={onPress} disabled />);
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    },
  );

  it('destructive is the outline in the danger color, readable in both themes', () => {
    for (const theme of [themes.light, themes.dark]) {
      const look = formButtonLook(theme, 'destructive', { pressed: false, disabled: false });
      expect(look.container.borderColor).toBe(theme.colors.danger);
      expect(look.label.color).toBe(theme.colors.danger);
      expect(contrastRatio(theme.colors.danger, look.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('secondary is the shared outline button, primary the ink fill', () => {
    const theme = themes.light;
    expect(formButtonLook(theme, 'secondary', { pressed: false, disabled: false }).container.borderColor).toBe(
      theme.colors.text,
    );
    expect(formButtonLook(theme, 'primary', { pressed: false, disabled: false }).fill).toBe(theme.colors.text);
  });
});

describe('ChipGroup', () => {
  it('renders sentence-case chips that report selection and reach 44 pt', async () => {
    const onPress = jest.fn();
    await render(
      <ChipGroup
        accessibilityLabel="Seasons"
        options={['summer', 'winter'] as const}
        isSelected={(s) => s === 'winter'}
        onPress={onPress}
      />,
    );
    const summer = screen.getByRole('button', { name: 'Summer' });
    expect(summer).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Winter' })).toBeSelected();
    expect(touchHeight(summer)).toBeGreaterThanOrEqual(44);
    expect(styleOf(screen.getByText('Summer')).fontSize).toBe(themes.light.typography.chipSentence.fontSize);
    await fireEvent.press(summer);
    expect(onPress).toHaveBeenCalledWith('summer');
  });

  it('style-tag chips use the italic serif; the long-press action is offered to screen readers', async () => {
    const onLongPress = jest.fn();
    await render(
      <ChipGroup
        accessibilityLabel="Tags on this item"
        variant="styleTag"
        options={['90s']}
        isSelected={() => true}
        onPress={() => {}}
        onLongPress={onLongPress}
        longPressLabel="Delete tag from your list"
        formatLabel={(t) => `${t}  ×`}
        formatAccessibilityLabel={(t) => t}
      />,
    );
    const chip = screen.getByRole('button', { name: '90s' });
    expect(styleOf(screen.getByText('90s  ×')).fontFamily).toBe(themes.light.fonts.serif.italic);
    expect(chip.props.accessibilityActions).toEqual([{ name: 'longpress', label: 'Delete tag from your list' }]);
    await fireEvent(chip, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(onLongPress).toHaveBeenCalledWith('90s');
  });
});

describe('form controls', () => {
  it('an add chip can drop its "+" (Edit colors)', async () => {
    await render(<Chip variant="add" label="Edit colors" plus={false} onPress={() => {}} />);
    expect(screen.getByText('Edit colors')).toBeTruthy();
    expect(screen.queryByText('+ Edit colors')).toBeNull();
  });

  it('TextField forwards a ref to its input (the tag box blurs itself)', async () => {
    const ref = createRef<TextInputInstance>();
    await render(<TextField ref={ref} label="New tag" labelHidden value="" onChangeText={() => {}} />);
    expect(ref.current).not.toBeNull();
  });

  it('angle tiles split the row into three columns', () => {
    const theme = themes.light;
    expect(angleTileWidth(theme, 342)).toBe(Math.floor((342 - 2 * 10) / 3));
    expect(angleTileWidth(theme, 0)).toBe(0);
  });

  it('color matrix: five columns; the ring keeps its width selected or not', () => {
    const look = colorMatrixLook(themes.light);
    expect(COLOR_MATRIX_COLUMNS).toBe(5);
    expect(look.ring(true).borderWidth).toBe(look.ring(false).borderWidth);
    expect(look.ring(true).borderColor).toBe(themes.light.colors.text);
    // Swatch plus ring stays within a 44 pt minimum target.
    expect(themes.light.sizes.matrixSwatchSize).toBeGreaterThanOrEqual(44);
  });
});

describe('camera intro and denied panel', () => {
  it('the intro has a header, the three ways out, and no "Don\'t Allow"', async () => {
    const access = camera({ surface: 'intro' });
    await render(<CameraIntroModal camera={access} />);
    expect(screen.getByRole('header', { name: CAMERA_ACCESS_TEXT.introTitle })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: CAMERA_ACCESS_TEXT.introAllow }));
    await fireEvent.press(screen.getByRole('button', { name: CAMERA_ACCESS_TEXT.library }));
    await fireEvent.press(screen.getByRole('button', { name: CAMERA_ACCESS_TEXT.notNow }));
    expect(access.allow).toHaveBeenCalledTimes(1);
    expect(access.chooseLibrary).toHaveBeenCalledTimes(1);
    expect(access.notNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/don't allow/i)).toBeNull();
  });

  it('the denied panel opens Settings, or asks again where the OS still can', async () => {
    const settings = camera({ surface: 'denied', permission: { status: 'denied', canAskAgain: false } });
    const view = await render(<CameraDeniedPanel camera={settings} disabled={false} />);
    expect(screen.getByRole('header', { name: CAMERA_ACCESS_TEXT.deniedTitle })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: CAMERA_ACCESS_TEXT.openSettings }));
    expect(settings.openSettings).toHaveBeenCalledTimes(1);

    const askAgain = camera({ surface: 'denied', permission: { status: 'denied', canAskAgain: true } });
    await view.rerender(<CameraDeniedPanel camera={askAgain} disabled={false} />);
    await fireEvent.press(screen.getByRole('button', { name: CAMERA_ACCESS_TEXT.askAgain }));
    expect(askAgain.allow).toHaveBeenCalledTimes(1);

    await view.rerender(<CameraDeniedPanel camera={camera({ surface: 'none' })} disabled={false} />);
    expect(screen.queryByText(CAMERA_ACCESS_TEXT.deniedTitle)).toBeNull();
  });
});

describe('SourceButtons (rendered)', () => {
  it('says next to the pick buttons that a smaller copy is sent for suggestions', async () => {
    const onPick = jest.fn();
    await render(<SourceButtons onPick={onPick} disabled={false} />);
    expect(screen.getByText(PHOTO_UPLOAD_NOTICE)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose from library' }));
    expect(onPick).toHaveBeenCalledWith('library');
  });
});
