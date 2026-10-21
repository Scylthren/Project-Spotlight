import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  type ImagePickerOptions,
  type ImagePickerResult,
} from 'expo-image-picker';

import type { PhotoPicker, PhotoSource, PickPhotoResult } from './photo-picker';

/**
 * Picker options. Kept minimal on purpose: no `quality` (default 1), because
 * `ImageProcessor` downscales and re-encodes every photo before it is stored,
 * and compressing here too would only lose quality twice. `exif: false` only
 * means the EXIF data is not returned to JS; it does not strip anything from
 * the picked file, which may still carry GPS. Metadata is removed from the
 * stored copy by `ImageProcessor` (tested in expo-image-processor.test.ts),
 * and the picked file is deleted after saving.
 */
const OPTIONS: ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  exif: false,
};

/**
 * Real `PhotoPicker` using the system photo library UI or camera UI.
 * Per the SDK 57 docs, the library needs no permission prompt for images;
 * the camera always needs camera permission, requested here first. (If it
 * was already denied, the request returns at once without a prompt.)
 * The camera does not work on the iOS Simulator; that shows up as 'error'.
 */
export class ExpoPhotoPicker implements PhotoPicker {
  async pick(source: PhotoSource): Promise<PickPhotoResult> {
    try {
      let result: ImagePickerResult;
      if (source === 'camera') {
        const permission = await requestCameraPermissionsAsync();
        if (!permission.granted) return { status: 'permission-denied', canAskAgain: permission.canAskAgain };
        result = await launchCameraAsync(OPTIONS);
      } else {
        result = await launchImageLibraryAsync(OPTIONS);
      }
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return { status: 'cancelled' };
      return { status: 'picked', photo: { uri: asset.uri, width: asset.width, height: asset.height } };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }
}
