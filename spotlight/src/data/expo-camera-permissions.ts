import { getCameraPermissionsAsync, requestCameraPermissionsAsync, type PermissionResponse } from 'expo-image-picker';
import { Linking } from 'react-native';

import type { CameraPermission } from '@/core';

import type { CameraPermissions } from './camera-permissions';

/** Maps the OS response; anything unexpected counts as not granted. */
export function toCameraPermission(response: PermissionResponse): CameraPermission {
  const status = response.granted
    ? 'granted'
    : response.status === 'undetermined'
      ? 'undetermined'
      : 'denied';
  return { status, canAskAgain: response.canAskAgain };
}

/**
 * Real `CameraPermissions` (names verified against the SDK 57 expo-image-picker
 * docs: `getCameraPermissionsAsync`, `requestCameraPermissionsAsync`).
 *
 * If a check fails, it resolves to 'undetermined' so the user sees the intro
 * and the real prompt decides. If a request fails, it resolves to a fresh
 * check, else 'denied' with `canAskAgain` (the panel then offers to try again).
 * `ExpoPhotoPicker` still requests permission itself before opening the
 * camera, so a wrong guess here can never open the camera without access.
 */
export class ExpoCameraPermissions implements CameraPermissions {
  async check(): Promise<CameraPermission> {
    try {
      return toCameraPermission(await getCameraPermissionsAsync());
    } catch {
      return { status: 'undetermined', canAskAgain: true };
    }
  }

  async request(): Promise<CameraPermission> {
    try {
      return toCameraPermission(await requestCameraPermissionsAsync());
    } catch {
      try {
        return toCameraPermission(await getCameraPermissionsAsync());
      } catch {
        return { status: 'denied', canAskAgain: true };
      }
    }
  }

  async openSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.warn('Could not open Settings', error);
    }
  }
}
