import { Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { SECTION_LABEL_ACCESSIBILITY, sectionLabelLook } from './section-label-style';

/** The tracked uppercase label above a section; a header to screen readers. */
export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text {...SECTION_LABEL_ACCESSIBILITY} style={sectionLabelLook(theme)}>
      {children}
    </Text>
  );
}
