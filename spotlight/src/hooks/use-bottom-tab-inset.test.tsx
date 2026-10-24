import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { useBottomTabInset } from './use-bottom-tab-inset';

function withInsets(bottom: number) {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom } };
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
  };
}

describe('useBottomTabInset', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  function on(os: 'ios' | 'android') {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }

  it('iOS with a home indicator: uses the tab safe area bottom', async () => {
    on('ios');
    const { result } = await renderHook(() => useBottomTabInset(), { wrapper: withInsets(83) });
    expect(result.current).toBe(83);
  });

  it('older iPhone: the tab bar height the safe area reports', async () => {
    on('ios');
    const { result } = await renderHook(() => useBottomTabInset(), { wrapper: withInsets(49) });
    expect(result.current).toBe(49);
  });

  it('Android with a navigation bar inset: 0 (automatic insets handle the bar)', async () => {
    on('android');
    const { result } = await renderHook(() => useBottomTabInset(), { wrapper: withInsets(48) });
    expect(result.current).toBe(0);
  });
});
