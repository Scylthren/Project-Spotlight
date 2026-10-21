import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';

import { keyboardAvoidanceFor } from '@/core';

const AVOIDANCE = keyboardAvoidanceFor(Platform.OS);

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /**
   * Android only: how far this view's parent starts below the top of the
   * window (the stack header's height, or 0 under tabs). The padding view
   * compares its layout, which is relative to its parent, with the keyboard's
   * position in the window. iOS measures in window coordinates and ignores it.
   */
  keyboardVerticalOffset?: number;
}

/**
 * A form's scroll view that keeps the focused field above the keyboard
 * (platform choice in `keyboardAvoidanceFor`) and lets the keyboard go:
 * - dragging the form closes it ('on-drag': same on both platforms;
 *   'interactive' is iOS-only and fights the Android padding view);
 * - a tap on empty space closes it; a tap on a button or chip still works on
 *   the first tap ('handled'). `KeyboardDismissArea` closes it after such taps.
 */
export function KeyboardAwareScrollView({ keyboardVerticalOffset = 0, ...props }: KeyboardAwareScrollViewProps) {
  const scroll = (
    <ScrollView
      {...props}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={AVOIDANCE.adjustScrollInsets}
    />
  );
  if (!AVOIDANCE.paddingView) return scroll;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset}>
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
