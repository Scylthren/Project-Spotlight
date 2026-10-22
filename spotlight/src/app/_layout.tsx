import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DatabaseErrorBoundary } from '@/components/database-error-boundary';
import { AppearanceSettings } from '@/data/appearance-settings';
import { CLOSET_DATABASE_NAME, DatabaseOpenError, migrateClosetDatabase } from '@/data/closet-schema';
import { asSqlDatabase } from '@/data/expo-sqlite-database';
import { createKvAppearanceStore } from '@/data/kv-appearance-store';
import { AppearanceProvider, useAppearanceReady } from '@/hooks/appearance';
import { ClosetServicesProvider } from '@/hooks/closet-services';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { useTheme } from '@/hooks/use-theme';
import { navigationTheme, statusBarStyle } from '@/theme/navigation';

SplashScreen.preventAutoHideAsync();

// One per app session: the Appearance setting, saved in expo-sqlite's key-value store.
const APPEARANCE_SETTINGS = new AppearanceSettings(createKvAppearanceStore(), (message, error) =>
  console.warn(message, error),
);

// Module-level so their identity is stable: SQLiteProvider reopens the
// database whenever `onInit` changes.
function initClosetDatabase(db: SQLiteDatabase): Promise<void> {
  return migrateClosetDatabase(asSqlDatabase(db));
}

function failClosetDatabase(error: Error): never {
  // SQLiteProvider calls this during render; the boundary above shows it.
  throw new DatabaseOpenError(error);
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const appearanceReady = useAppearanceReady(APPEARANCE_SETTINGS);
  // Render nothing until the fonts and the saved Appearance are ready (or
  // failed or timed out): the native splash stays up, since
  // AnimatedSplashOverlay hides it on layout, and no wrong theme flashes.
  if (!fontsReady || !appearanceReady) return null;
  return (
    <AppearanceProvider settings={APPEARANCE_SETTINGS}>
      <ThemedNavigation />
    </AppearanceProvider>
  );
}

function ThemedNavigation() {
  const theme = useTheme();
  const navTheme = useMemo(() => navigationTheme(theme), [theme]);
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={statusBarStyle(theme)} />
      <AnimatedSplashOverlay />
      <DatabaseErrorBoundary>
        <SQLiteProvider
          databaseName={CLOSET_DATABASE_NAME}
          onInit={initClosetDatabase}
          onError={failClosetDatabase}>
          <ClosetServicesProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Closet' }} />
              <Stack.Screen name="item/[id]" options={{ title: 'Edit item' }} />
            </Stack>
          </ClosetServicesProvider>
        </SQLiteProvider>
      </DatabaseErrorBoundary>
    </ThemeProvider>
  );
}
