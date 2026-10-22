import { useCallback, useEffect, useState } from 'react';

import { checkConnection, type ClosetTagger, type ConnectionStatus } from '@/ai';
import { normalizeDevToken, type DevTokenInput, type DevTokenStore } from '@/data/dev-token-store';

import { useIsMounted } from './use-is-mounted';

export interface DevBackendServices {
  tokenStore: DevTokenStore;
  tagger: ClosetTagger;
}

/** Whether a token is saved: unknown while loading, or when the store failed. */
export type SavedTokenState = 'loading' | 'saved' | 'none' | 'unavailable';

const INPUT_ERRORS: Record<Exclude<DevTokenInput, { ok: true }>['reason'], string> = {
  empty: 'Paste the token first.',
  'too-short': 'That is too short to be the token.',
  'too-long': 'That is too long to be the token.',
  invalid: 'The token cannot contain spaces or special characters.',
};

/**
 * State for the Me tab's dev-only Backend section: the token draft, whether
 * one is saved (the saved value is never read back into the UI), and the
 * last connection check.
 */
export function useDevBackend({ tokenStore, tagger }: DevBackendServices) {
  const isMounted = useIsMounted();
  const [saved, setSaved] = useState<SavedTokenState>('loading');
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    tokenStore.get().then(
      (token) => isMounted() && setSaved(token ? 'saved' : 'none'),
      () => isMounted() && setSaved('unavailable'),
    );
  }, [tokenStore, isMounted]);

  const changeDraft = useCallback((text: string) => {
    setDraft(text);
    setInputError(undefined);
  }, []);

  const save = useCallback(async () => {
    const input = normalizeDevToken(draft);
    if (!input.ok) {
      setInputError(INPUT_ERRORS[input.reason]);
      return;
    }
    setBusy(true);
    try {
      await tokenStore.set(input.token);
      if (!isMounted()) return;
      setSaved('saved');
      setDraft('');
      setStatus(null);
    } catch {
      if (isMounted()) setSaved('unavailable');
    } finally {
      if (isMounted()) setBusy(false);
    }
  }, [draft, tokenStore, isMounted]);

  const clear = useCallback(async () => {
    setBusy(true);
    try {
      await tokenStore.clear();
      if (!isMounted()) return;
      setSaved('none');
      setStatus(null);
    } catch {
      if (isMounted()) setSaved('unavailable');
    } finally {
      if (isMounted()) setBusy(false);
    }
  }, [tokenStore, isMounted]);

  const test = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const result = await checkConnection(tagger);
    if (!isMounted()) return;
    setStatus(result);
    setBusy(false);
  }, [tagger, isMounted]);

  return { saved, draft, changeDraft, inputError, busy, status, save, clear, test };
}
