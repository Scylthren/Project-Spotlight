import { automaticTabContentInsets, bottomTabInsetFor } from '@/core';

describe('automaticTabContentInsets', () => {
  it('turns the library insets off on iOS only (manual padding there)', () => {
    expect(automaticTabContentInsets('ios')).toBe(false);
    expect(automaticTabContentInsets('android')).toBe(true);
    expect(automaticTabContentInsets('web')).toBe(true);
  });
});

describe('bottomTabInsetFor', () => {
  it('Face ID iPhone: the tab safe area (tab bar plus home indicator)', () => {
    expect(bottomTabInsetFor('ios', 83)).toBe(83);
  });

  it('iPhone with a Home button: the tab bar alone', () => {
    expect(bottomTabInsetFor('ios', 49)).toBe(49);
  });

  it('iOS follows a taller bar instead of a fixed guess', () => {
    expect(bottomTabInsetFor('ios', 96)).toBe(96);
  });

  it('Android adds nothing, even with a navigation bar inset (the library wrapper already clears the bar)', () => {
    expect(bottomTabInsetFor('android', 48)).toBe(0);
    expect(bottomTabInsetFor('android', 0)).toBe(0);
  });

  it('other platforms add nothing; a negative inset never shrinks the padding', () => {
    expect(bottomTabInsetFor('web', 34)).toBe(0);
    expect(bottomTabInsetFor('ios', -1)).toBe(0);
  });

  it('never counts the bar twice: manual padding only where automatic insets are off', () => {
    for (const os of ['ios', 'android', 'web', 'windows', 'macos']) {
      if (automaticTabContentInsets(os)) expect(bottomTabInsetFor(os, 83)).toBe(0);
      else expect(bottomTabInsetFor(os, 83)).toBe(83);
    }
  });
});
