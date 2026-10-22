import type { AccessibilityRole, TextStyle } from 'react-native';

import type { Theme } from '@/theme';

/** An 11 pt tracked uppercase label above a section (README "Type scale"). */
export function sectionLabelLook(theme: Theme): TextStyle {
  return { ...theme.typography.label, color: theme.colors.text };
}

export const SECTION_LABEL_ACCESSIBILITY = { accessibilityRole: 'header' as AccessibilityRole };
