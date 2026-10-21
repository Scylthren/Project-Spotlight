import type { ReactNode } from 'react';
import { Keyboard, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Closes the keyboard when a touch inside ends: the tapped button or chip
 * has already handled the press. Closing it on touch start instead could
 * move the content under the finger (the keyboard inset shrinks) and cancel
 * the press. Wrap everything except the tag box area, where chips and "Add"
 * keep the keyboard up for the next tag.
 */
export function KeyboardDismissArea({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={style} onTouchEnd={dismissKeyboard}>
      {children}
    </View>
  );
}

function dismissKeyboard() {
  Keyboard.dismiss();
}
