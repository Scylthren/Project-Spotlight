import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { checkStyleRequest, styleRequestError } from '@/data/style-messages';
import type { StyleSession } from '@/data/style-session';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { styleServices, type StyleServices } from './style-services';

/**
 * The Style screen's state: the request text, the recent requests (reloaded
 * on focus; none when storage fails) and `submit`, which starts the request
 * (`StyleSessions.begin`, so a double tap starts one) and remembers it.
 * Returns the session to show, or null when nothing was started.
 */
export function useStylePrompt(services: StyleServices = styleServices()) {
  const { repository } = useClosetServices();
  const isMounted = useIsMounted();
  const [text, setText] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      services.recentRequests.load().then(
        (list) => active && setRecents(list),
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [services]),
  );

  function submit(): StyleSession | null {
    const check = checkStyleRequest(text);
    if (!check.ok) return null;
    const session = services.sessions.begin(check.request, {
      generator: services.generator,
      loadCloset: () => repository.list(),
    });
    if (!session) return null;
    services.recentRequests.add(check.request).then(
      (list) => isMounted() && setRecents(list),
      () => undefined,
    );
    return session;
  }

  const check = checkStyleRequest(text);
  return { text, setText, recents, error: styleRequestError(text), canSubmit: check.ok, submit };
}
