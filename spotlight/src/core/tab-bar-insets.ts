/**
 * How tab screens keep their last row clear of the native tab bar.
 *
 * Sources (expo-router 58.0.25, react-native-screens 4.30.0, read in node_modules):
 * - expo-router `NativeTabTriggerProps.disableAutomaticContentInsets` (native-tabs/types.d.ts):
 *   on Android each tab's content is wrapped in a `SafeAreaView` with the bottom edge, so the
 *   screen already ends above the tab bar; on iOS only the first scroll view in the
 *   first-child chain gets automatic content insets.
 * - The iOS rule is fragile: react-native-screens (`RNSScrollViewFinder`) walks `subviews[0]`
 *   only, and only when the screen's first child mounts. The Closet grid sits after its header,
 *   so it never got the inset; other screens did. So on iOS we turn it off and pad by hand.
 * - expo-router wraps each iOS tab in its own `SafeAreaProvider` (NativeTabsView.ios.js), whose
 *   bottom inset is UIKit's `safeAreaInsets` for that tab: the tab bar plus the home indicator
 *   (Apple: a view's safe area excludes the area covered by tab bars). It follows the real bar,
 *   including taller or floating bars on newer iOS, so no fixed height is needed.
 */

/** Whether the library's automatic insets stay on for a platform (passed to every tab trigger). */
export function automaticTabContentInsets(platform: string): boolean {
  // Off on iOS, where we pad manually below; on everywhere else (Android's wrapper is reliable).
  return platform !== 'ios';
}

/**
 * Bottom padding a scrolling tab screen adds so its content clears the tab bar, before its own
 * spacing. `safeAreaBottom` is `useSafeAreaInsets().bottom` read inside the tab screen.
 * - iOS: the tab's safe area bottom (tab bar plus home indicator; 49 on a Home-button iPhone,
 *   about 83 on a Face ID iPhone).
 * - Android: 0. The library's wrapper already keeps content above the bar, and the window inset
 *   seen here is the navigation bar, which the tab bar itself already sits above.
 * - Other platforms: 0 (no native tab bar over the content).
 * Never both this and the automatic insets on one platform, or the gap counts twice.
 */
export function bottomTabInsetFor(platform: string, safeAreaBottom: number): number {
  if (automaticTabContentInsets(platform)) return 0;
  return Math.max(0, safeAreaBottom);
}
