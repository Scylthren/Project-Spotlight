import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { automaticTabContentInsets } from '@/core';
import { useTheme } from '@/hooks/use-theme';
import { tabBarAppearance } from '@/theme/navigation';

/**
 * The native tab bar with the mockup's labels, icons and colors (no center
 * Scan button, no custom bar). Labels are uppercase text because native tabs
 * cannot transform text; screen readers get the plain words.
 * Icons: SF Symbols on iOS, Material Symbols on Android. Style uses a wand
 * with sparkles (the mockup's icon). Add uses a filled
 * circle with a plus, the nearest native match to the mockup's round ink
 * Scan button. Looks (the Lookbook, Gate 3 D1) uses a bookmark, the
 * mockup's icon. Five tabs is the iOS maximum before "More".
 *
 * Content insets: automatic on Android, manual on iOS (`useBottomTabInset`);
 * see `core/tab-bar-insets.ts`. Set on every trigger.
 */
const DISABLE_AUTOMATIC_INSETS = !automaticTabContentInsets(Platform.OS);

export default function AppTabs() {
  const theme = useTheme();
  const bar = tabBarAppearance(theme);

  return (
    <NativeTabs
      backgroundColor={bar.backgroundColor}
      shadowColor={bar.shadowColor}
      iconColor={bar.iconColor}
      labelStyle={bar.labelStyle}
      rippleColor={bar.rippleColor}
      disableIndicator
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="index" accessibilityLabel="Closet"
        disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}>
        <NativeTabs.Trigger.Label>CLOSET</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="hanger" md="checkroom" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="style" accessibilityLabel="Style"
        disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}>
        <NativeTabs.Trigger.Label>STYLE</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wand.and.stars" md="auto_fix_high" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="add" accessibilityLabel="Add item"
        disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}>
        <NativeTabs.Trigger.Label>ADD</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus.circle.fill" md="add_circle" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="looks" accessibilityLabel="Looks"
        disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}>
        <NativeTabs.Trigger.Label>LOOKS</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bookmark" md="bookmark" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="me" accessibilityLabel="Me"
        disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}>
        <NativeTabs.Trigger.Label>ME</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
