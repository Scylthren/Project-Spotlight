import { Stack } from 'expo-router';

/** The Looks tab's own stack, so a saved look opens with the tab bar still showing. Both screens draw their own headers. */
export default function LooksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Lookbook' }} />
      <Stack.Screen name="[id]" options={{ title: 'Saved look' }} />
    </Stack>
  );
}
