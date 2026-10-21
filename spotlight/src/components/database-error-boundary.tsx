import { Component, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { DatabaseOpenError, describeDatabaseError } from '@/data/closet-schema';

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
}

/**
 * Shows a readable screen when the closet database fails to open or migrate.
 * Only catches `DatabaseOpenError` (thrown by SQLiteProvider's onError in the
 * root layout); any other error is rethrown to Expo Router's error boundary.
 */
export class DatabaseErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (error instanceof DatabaseOpenError) console.error('Closet database failed to open', error.original);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    // Not ours: rethrowing from render hands it to the next boundary up.
    if (!(error instanceof DatabaseOpenError)) throw error;
    const { title, detail } = describeDatabaseError(error);
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle" accessibilityRole="header">
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{detail}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
