import { canonicalTagText } from './tags';

/**
 * Keyboard rules for the item form (slice 6). The keyboard itself can only be
 * checked on a device; these are the decisions behind it.
 */

/** What the tag box's return key ("Done") does. */
export type TagReturnAction = 'add-tag' | 'close-keyboard';

/**
 * The tag box is the form's only text field, so there is no "next" field.
 * Return with something typed adds it as a tag and keeps the keyboard up for
 * another tag; return on an empty box (blank or only spaces) closes the
 * keyboard. A rejected tag (too long, too many) keeps the keyboard up so
 * the user can fix it; the form shows why.
 */
export function tagReturnKeyAction(typed: string): TagReturnAction {
  return canonicalTagText(typed) === '' ? 'close-keyboard' : 'add-tag';
}

/** How a scrolling form keeps the focused field above the keyboard on one platform. */
export interface KeyboardAvoidance {
  /**
   * iOS: the scroll view adds the keyboard's overlap to its bottom inset and
   * scrolls the focused field into view (`automaticallyAdjustKeyboardInsets`).
   * Works in window coordinates, so headers and tab bars need no offset.
   */
  adjustScrollInsets: boolean;
  /**
   * Android: a `KeyboardAvoidingView` pads the bottom by the keyboard's
   * overlap, which shrinks the scroll view; Android's ScrollView then scrolls
   * the focused field back into view. With edge-to-edge (enforced in recent
   * SDKs) the window may not resize for the keyboard; if it does, the overlap
   * is 0 and the padding is 0, so there is no double gap.
   */
  paddingView: boolean;
}

/** Never both at once: that would leave the keyboard's height twice. Web needs neither. */
export function keyboardAvoidanceFor(os: string): KeyboardAvoidance {
  switch (os) {
    case 'ios':
      return { adjustScrollInsets: true, paddingView: false };
    case 'android':
      return { adjustScrollInsets: false, paddingView: true };
    default:
      return { adjustScrollInsets: false, paddingView: false };
  }
}
