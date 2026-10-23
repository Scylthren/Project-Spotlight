import { Alert } from 'react-native';

import { discardImportText } from './discard-import-text';

/**
 * Asks before discarding an import. iOS and Android: native alert;
 * dismissing it counts as "keep". Web: see confirm-discard-import.web.ts.
 */
export function confirmDiscardImport(remaining: number): Promise<boolean> {
  const text = discardImportText(remaining);
  return new Promise((resolve) => {
    Alert.alert(
      text.title,
      text.detail,
      [
        { text: 'Keep reviewing', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Discard', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
