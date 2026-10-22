import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import {
  backChevronLook,
  screenHeaderAccessibility,
  screenHeaderLook,
  stepAccessibilityLabel,
  stepText,
} from './screen-header-style';

type ScreenHeaderProps =
  | {
      variant?: 'masthead';
      title: string;
      /** A short note on the right, e.g. "24 pieces". */
      aside?: string;
    }
  | {
      variant: 'step';
      title: string;
      /** Without it there is no back button (the slot stays, to keep the title centered). */
      onBack?: () => void;
      step?: { current: number; total: number };
    };

/** The masthead (big serif title over a 2 pt rule) or a step header. */
export function ScreenHeader(props: ScreenHeaderProps) {
  const theme = useTheme();
  const a11y = screenHeaderAccessibility();

  if (props.variant !== 'step') {
    const look = screenHeaderLook(theme, 'masthead');
    return (
      <View style={look.container}>
        <Text {...a11y.title} style={look.title}>
          {props.title}
        </Text>
        {props.aside ? <Text style={look.aside}>{props.aside}</Text> : null}
      </View>
    );
  }

  const look = screenHeaderLook(theme, 'step');
  return (
    <View style={look.container}>
      <View style={look.side}>
        {props.onBack ? (
          <Pressable {...a11y.back} onPress={props.onBack} hitSlop={look.backHitSlop} style={look.backButton}>
            <View style={backChevronLook(theme)} />
          </Pressable>
        ) : null}
      </View>
      <Text {...a11y.title} style={look.title}>
        {props.title}
      </Text>
      <View style={look.side}>
        {props.step ? (
          <Text accessibilityLabel={stepAccessibilityLabel(props.step)} style={look.aside}>
            {stepText(props.step)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
