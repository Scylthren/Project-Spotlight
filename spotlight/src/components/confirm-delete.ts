import { Alert } from 'react-native';

export const DELETE_ITEM_DETAIL = 'This removes the item and its photo from this device. It cannot be undone.';

/**
 * Asks before deleting. iOS and Android: native alert. Dismissing it (Android
 * back button or tapping outside) counts as cancel. Web: see confirm-delete.web.ts,
 * because react-native-web's Alert does not show buttons.
 */
export function confirmDelete(what: string, detail: string = DELETE_ITEM_DETAIL): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Delete ${what}?`,
      detail,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
