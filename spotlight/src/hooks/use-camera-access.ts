import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { CameraAccessFlow, type CameraAccessHost } from '@/data/camera-access-flow';

import { useClosetServices } from './closet-services';

/**
 * Camera permission flow for one form (logic in `CameraAccessFlow` and
 * core/camera-access.ts). Checks the permission on mount and whenever the
 * app returns to the foreground (e.g. back from Settings). With
 * `promptOnEntry` (the Add screen), focusing the screen shows the intro or
 * the denied panel if needed, at most once per app session.
 */
export function useCameraAccess(host: CameraAccessHost, { promptOnEntry }: { promptOnEntry: boolean }) {
  const { cameraPermissions, entryPromptSession } = useClosetServices();
  const [flow] = useState(() => new CameraAccessFlow(cameraPermissions, entryPromptSession, host));
  // The flow calls the latest callbacks (they read the form's latest state).
  useEffect(() => {
    flow.setHost(host);
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getState);

  useEffect(() => {
    flow.start();
    void flow.check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flow.check();
    });
    return () => {
      subscription.remove();
      flow.dispose();
    };
  }, [flow]);

  useFocusEffect(
    useCallback(() => {
      if (promptOnEntry) flow.enter();
    }, [flow, promptOnEntry]),
  );

  return {
    state,
    takePhoto: (target: Parameters<CameraAccessFlow['takePhoto']>[0]) => flow.takePhoto(target),
    allow: () => void flow.allow(),
    notNow: () => flow.notNow(),
    chooseLibrary: () => flow.chooseLibrary(),
    openSettings: () => void flow.openSettings(),
    introClosed: () => flow.introClosed(),
  };
}

export type CameraAccess = ReturnType<typeof useCameraAccess>;
