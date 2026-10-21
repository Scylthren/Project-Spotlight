import { keyboardAvoidanceFor, tagReturnKeyAction } from '@/core';

describe('tagReturnKeyAction', () => {
  it('adds the tag when something is typed', () => {
    expect(tagReturnKeyAction('90s')).toBe('add-tag');
    expect(tagReturnKeyAction('  work wear ')).toBe('add-tag');
  });

  it('closes the keyboard on an empty or blank box', () => {
    expect(tagReturnKeyAction('')).toBe('close-keyboard');
    expect(tagReturnKeyAction('   ')).toBe('close-keyboard');
    expect(tagReturnKeyAction('\t\n ')).toBe('close-keyboard');
  });

  it('still tries to add text that is not a valid tag, so the form can say why', () => {
    expect(tagReturnKeyAction('x'.repeat(200))).toBe('add-tag');
  });
});

describe('keyboardAvoidanceFor', () => {
  it('iOS uses the scroll view insets only', () => {
    expect(keyboardAvoidanceFor('ios')).toEqual({ adjustScrollInsets: true, paddingView: false });
  });

  it('Android uses the padding view only', () => {
    expect(keyboardAvoidanceFor('android')).toEqual({ adjustScrollInsets: false, paddingView: true });
  });

  it('never combines both (the gap would be twice the keyboard)', () => {
    for (const os of ['ios', 'android', 'web', 'windows', 'macos']) {
      const avoidance = keyboardAvoidanceFor(os);
      expect(avoidance.adjustScrollInsets && avoidance.paddingView).toBe(false);
    }
  });

  it('web and others do nothing', () => {
    expect(keyboardAvoidanceFor('web')).toEqual({ adjustScrollInsets: false, paddingView: false });
  });
});
