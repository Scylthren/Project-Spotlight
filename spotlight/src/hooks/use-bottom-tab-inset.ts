import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bottomTabInsetFor } from '@/core';

/**
 * Space the native tab bar covers at the bottom of a tab screen (rules in
 * `core/tab-bar-insets.ts`). Call it inside a tab screen so it reads that tab's safe area.
 */
export function useBottomTabInset(): number {
  return bottomTabInsetFor(Platform.OS, useSafeAreaInsets().bottom);
}
