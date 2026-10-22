import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FakeClosetTagger, STUB_TAG_ITEM_RESPONSE } from '@/ai';
import { InMemoryDevTokenStore, type DevTokenStore } from '@/data/dev-token-store';

import { BackendSection } from './backend-section';

const TOKEN = '7d'.repeat(32);

async function renderSection(store: DevTokenStore = new InMemoryDevTokenStore(), tagger = new FakeClosetTagger()) {
  await render(<BackendSection services={{ tokenStore: store, tagger }} />);
  return { store, tagger };
}

const tokenField = () => screen.getByLabelText('Dev token');

describe('BackendSection (rendered)', () => {
  it('says when no token is saved, uses a secure field, and cannot save an empty one', async () => {
    await renderSection();
    expect(await screen.findByText('No token saved on this device.')).toBeTruthy();
    expect(tokenField().props.secureTextEntry).toBe(true);
    expect(tokenField().props.autoCorrect).toBe(false);
    expect(tokenField().props.autoCapitalize).toBe('none');
    expect(screen.getByRole('button', { name: 'Save token' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear token' })).toBeNull();
  });

  it('saves a pasted token (trimmed), clears the field and never shows the token', async () => {
    const { store } = await renderSection();
    await screen.findByText('No token saved on this device.');
    await fireEvent.changeText(tokenField(), `${TOKEN}\n`);
    await fireEvent.press(screen.getByRole('button', { name: 'Save token' }));
    expect(await screen.findByText('A token is saved on this device.')).toBeTruthy();
    expect(await store.get()).toBe(TOKEN);
    expect(tokenField().props.value).toBe('');
    expect(screen.queryByText(TOKEN)).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toContain(TOKEN);
  });

  it('shows why a token was refused and keeps nothing', async () => {
    const { store } = await renderSection();
    await screen.findByText('No token saved on this device.');
    await fireEvent.changeText(tokenField(), 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Save token' }));
    expect(await screen.findByText('That is too short to be the token.')).toBeTruthy();
    expect(await store.get()).toBeNull();
  });

  it('clears a saved token', async () => {
    const { store } = await renderSection(new InMemoryDevTokenStore(TOKEN));
    await screen.findByText('A token is saved on this device.');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear token' }));
    expect(await screen.findByText('No token saved on this device.')).toBeTruthy();
    expect(await store.get()).toBeNull();
  });

  it.each([
    [{ ok: true as const, tags: STUB_TAG_ITEM_RESPONSE.tags, stub: true }, 'Connected. The backend answered.'],
    [{ ok: false as const, failure: 'unauthorized' as const }, 'Wrong token. The backend refused it.'],
    [{ ok: false as const, failure: 'offline' as const }, 'Offline. The backend could not be reached.'],
    [{ ok: false as const, failure: 'timeout' as const }, 'Timed out. The backend did not answer in time.'],
  ])('tests the connection and shows the result', async (outcome, message) => {
    const tagger = new FakeClosetTagger();
    tagger.queue.push(outcome);
    await renderSection(new InMemoryDevTokenStore(TOKEN), tagger);
    await screen.findByText('A token is saved on this device.');
    await fireEvent.press(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(tagger.inputs).toHaveLength(1);
  });

  it('disables Test connection while a check is running', async () => {
    const tagger = new FakeClosetTagger();
    let finish: () => void = () => {};
    tagger.queue.push(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: false, failure: 'offline' });
        }),
    );
    await renderSection(new InMemoryDevTokenStore(TOKEN), tagger);
    await screen.findByText('A token is saved on this device.');
    // Not awaited: the press handler stays pending until `finish`.
    const pressed = fireEvent.press(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Working…' }));
    expect(tagger.inputs).toHaveLength(1);
    await act(async () => {
      finish();
      await pressed;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled());
  });

  it('reports storage that cannot be read', async () => {
    const broken: DevTokenStore = {
      get: () => Promise.reject(new Error('no keychain')),
      set: () => Promise.reject(new Error('no keychain')),
      clear: () => Promise.reject(new Error('no keychain')),
    };
    await renderSection(broken);
    expect(await screen.findByText('Secure storage is not available here.')).toBeTruthy();
  });
});
