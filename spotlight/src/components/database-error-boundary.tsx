import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatabaseOpenError, describeDatabaseError } from '@/data/closet-schema';
import { useTheme } from '@/hooks/use-theme';

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
    return <DatabaseErrorScreen title={title} detail={detail} />;
  }
}

/** The error screen in the theme: serif title, secondary body text. */
function DatabaseErrorScreen({ title, detail }: { title: string; detail: string }) {
  const { colors, fonts, spacing, typography } = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ ...typography.headline, fontFamily: fonts.serif.semiBold, color: colors.text }}>
        {title}
      </Text>
      <Text style={{ ...typography.bodyLarge, color: colors.textBodySecondary }}>{detail}</Text>
    </SafeAreaView>
  );
}
