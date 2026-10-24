import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import type { Ref } from 'react';
import { Pressable, Text, View, type HostInstance } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Closet</TabButton>
          </TabTrigger>
          <TabTrigger name="style" href="/style" asChild>
            <TabButton>Style</TabButton>
          </TabTrigger>
          <TabTrigger name="add" href="/add" asChild>
            <TabButton>Add item</TabButton>
          </TabTrigger>
          <TabTrigger name="me" href="/me" asChild>
            <TabButton>Me</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

/** A tab: tracked uppercase label, ink when focused (the native tab bar's look on web). */
export function TabButton({ children, isFocused, ref, ...props }: TabTriggerSlotProps) {
  const { colors, opacity, spacing, typography, borders } = useTheme();
  // expo-router 58 types this ref as RefAttributes<View>, which on React Native
  // 0.88 names the component, not the instance Pressable hands back.
  const hostRef = ref as Ref<HostInstance> | undefined;
  return (
    <Pressable {...props} ref={hostRef} style={({ pressed }) => ({ opacity: pressed ? opacity.pressed : 1 })}>
      <View
        style={{
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.lg,
          borderBottomWidth: borders.masthead,
          borderBottomColor: isFocused ? colors.accent : colors.background,
        }}>
        <Text style={{ ...typography.tabLabel, color: isFocused ? colors.accent : colors.textSecondary }}>{children}</Text>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { colors, sizes, spacing, typography, borders } = useTheme();
  return (
    <View
      {...props}
      style={{
        position: 'absolute',
        width: '100%',
        padding: spacing.lg,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
      }}>
      <View
        style={{
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.xxxl,
          flexDirection: 'row',
          alignItems: 'center',
          flexGrow: 1,
          gap: spacing.sm,
          maxWidth: sizes.maxContentWidth,
          backgroundColor: colors.background,
          borderBottomWidth: borders.hairline,
          borderBottomColor: colors.text,
        }}>
        <Text style={{ ...typography.headerLabel, color: colors.text, marginRight: 'auto' }}>Spotlight</Text>
        {props.children}
      </View>
    </View>
  );
}
