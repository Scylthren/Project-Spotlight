import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DatabaseErrorBoundary } from '@/components/database-error-boundary';
import { CLOSET_DATABASE_NAME, DatabaseOpenError, migrateClosetDatabase } from '@/data/closet-schema';
import { asSqlDatabase } from '@/data/expo-sqlite-database';
import { ClosetServicesProvider } from '@/hooks/closet-services';

SplashScreen.preventAutoHideAsync();

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
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
