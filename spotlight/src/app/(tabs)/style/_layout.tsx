import { Stack } from 'expo-router';

/** The Style tab's own stack, so Results is pushed with the tab bar still showing. Both screens draw their own headers. */
export default function StyleLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Style' }} />
      <Stack.Screen name="results" options={{ title: 'Looks' }} />
    </Stack>
  );
}
