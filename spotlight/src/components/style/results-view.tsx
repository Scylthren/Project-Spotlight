import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { backChevronLook, screenHeaderAccessibility, screenHeaderLook } from '@/components/ui/screen-header-style';
import { looksCountText, omittedItemsText } from '@/core';
import {
  describeStyleFailure,
  LOOKS_REMOVED_VIEW,
  NO_LOOKS_VIEW,
  quotedRequest,
  type StyleFailureAction,
  type StyleFailureView,
} from '@/data/style-messages';
import type { StyleSnapshot } from '@/data/style-session';
import { useTheme } from '@/hooks/use-theme';

import { LookCard } from './look-card';
import { resultsLook } from './style-look';

export interface ResultsHandlers {
  onBack: () => void;
  onCancel: () => void;
  onRetry: () => void;
  /** Opens the Add tab (not enough pieces). */
  onAddPiece: () => void;
  onRestyle: (key: string) => void;
}

interface ResultsViewProps extends ResultsHandlers {
  /** Null when there is no request to show (e.g. the app restarted on this screen). */
  snapshot: StyleSnapshot | null;
  resolveImageUri: (ref: string) => string;
  /** Space under the content (the tab bar). */
  bottomInset: number;
}

/** The Results screen's content for each state: loading (with Cancel), looks, no looks, and every failure. */
export function ResultsView({ snapshot, resolveImageUri, bottomInset, ...handlers }: ResultsViewProps) {
  const theme = useTheme();
  const look = resultsLook(theme);
  const status = snapshot?.status;
  const subtitle =
    status?.kind === 'loading'
      ? 'Finding looks in your closet...'
      : status?.kind === 'ready' && status.looks.length > 0
        ? looksCountText(status.looks.length)
        : null;

  return (
    <View style={{ flex: 1 }}>
      <ResultsHeader title={snapshot ? quotedRequest(snapshot.request) : 'Looks'} subtitle={subtitle} onBack={handlers.onBack} />
      <ScrollView contentContainerStyle={[look.body, { paddingBottom: bottomInset }]}>
        <ResultsBody snapshot={snapshot} resolveImageUri={resolveImageUri} handlers={handlers} />
      </ScrollView>
    </View>
  );
}

function ResultsBody({
  snapshot,
  resolveImageUri,
  handlers,
}: {
  snapshot: StyleSnapshot | null;
  resolveImageUri: (ref: string) => string;
  handlers: ResultsHandlers;
}) {
  const theme = useTheme();
  const look = resultsLook(theme);
  if (!snapshot) {
    return <StateMessage view={{ title: 'Nothing to show', body: 'Ask for looks on the Style tab.', action: 'edit-request' }} handlers={handlers} />;
  }
  const { status } = snapshot;
  switch (status.kind) {
    case 'idle':
    case 'loading':
      return (
        <View style={look.state} accessibilityLiveRegion="polite">
          <ActivityIndicator color={look.spinnerColor} accessibilityLabel="Finding looks" />
          <Text style={look.stateBody}>This can take up to 15 seconds.</Text>
          <Button variant="outline" label="Cancel" onPress={handlers.onCancel} />
        </View>
      );
    case 'empty':
      return <StateMessage view={NO_LOOKS_VIEW} handlers={handlers} />;
    case 'failed':
      return <StateMessage view={describeStyleFailure(status.failure, status.missing)} handlers={handlers} />;
    case 'cancelled':
      return <StateMessage view={describeStyleFailure('cancelled')} handlers={handlers} />;
    case 'ready': {
      if (status.looks.length === 0) return <StateMessage view={LOOKS_REMOVED_VIEW} handlers={handlers} />;
      const omitted = omittedItemsText(status.omittedItems);
      return (
        <>
          {omitted ? <Text style={look.omitted}>{omitted}</Text> : null}
          {status.looks.map((item, index) => (
            <LookCard
              key={item.key}
              look={item}
              position={index + 1}
              total={status.looks.length}
              resolveImageUri={resolveImageUri}
              onRestyle={() => handlers.onRestyle(item.key)}
            />
          ))}
        </>
      );
    }
  }
}

const ACTION_LABELS: Readonly<Record<Exclude<StyleFailureAction, 'none'>, string>> = {
  retry: 'Try again',
  'add-piece': 'Add a piece',
  'edit-request': 'Change request',
};

function StateMessage({ view, handlers }: { view: StyleFailureView; handlers: ResultsHandlers }) {
  const theme = useTheme();
  const look = resultsLook(theme);
  const press =
    view.action === 'retry'
      ? handlers.onRetry
      : view.action === 'add-piece'
        ? handlers.onAddPiece
        : handlers.onBack;
  return (
    <View style={look.state} accessibilityLiveRegion="polite">
      <Text style={look.stateTitle} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={look.stateBody}>{view.body}</Text>
      {view.action === 'none' ? (
        <Button variant="outline" label="Back" onPress={handlers.onBack} />
      ) : (
        <Button variant={view.action === 'edit-request' ? 'outline' : 'primary'} label={ACTION_LABELS[view.action]} onPress={press} />
      )}
    </View>
  );
}

function ResultsHeader({ title, subtitle, onBack }: { title: string; subtitle: string | null; onBack: () => void }) {
  const theme = useTheme();
  const look = resultsLook(theme);
  const step = screenHeaderLook(theme, 'step');
  const a11y = screenHeaderAccessibility();
  return (
    <View style={look.header}>
      <Pressable {...a11y.back} accessibilityLabel="Back to Style" onPress={onBack} hitSlop={step.backHitSlop} style={step.backButton}>
        <View style={backChevronLook(theme)} />
      </Pressable>
      <View style={look.titleBlock}>
        <Text {...a11y.title} style={look.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={look.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
