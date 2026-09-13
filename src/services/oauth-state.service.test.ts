import crypto from 'crypto';

jest.mock('./redis.service', () => ({ redisService: {} }));

import { OAuthStateStore } from './oauth-state.service';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    set: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    getDel: jest.fn(async (key: string) => {
      const value = data.get(key) ?? null;
      data.delete(key);
      return value;
    }),
  };
}

const newState = () => crypto.randomBytes(16).toString('hex');

describe('OAuthStateStore', () => {
  it('returns what was saved, with the wallet normalised to lowercase', async () => {
    const store = new OAuthStateStore(memoryStorage());
    const state = newState();
    await store.save('twitter', state, { wallet: '0xABCdef', issuerId: 'i1', codeVerifier: 'v' });

    expect(await store.consume('twitter', state)).toEqual({
      wallet: '0xabcdef',
      issuerId: 'i1',
      codeVerifier: 'v',
    });
  });

  it('can only be used once', async () => {
    const store = new OAuthStateStore(memoryStorage());
    const state = newState();
    await store.save('discord', state, { wallet: '0x1' });

    expect(await store.consume('discord', state)).not.toBeNull();
    expect(await store.consume('discord', state)).toBeNull();
  });

  it('does not accept a Twitter state for a Discord login', async () => {
    const store = new OAuthStateStore(memoryStorage());
    const state = newState();
    await store.save('twitter', state, { wallet: '0x1' });

    expect(await store.consume('discord', state)).toBeNull();
  });

  it('rejects a state that was never issued', async () => {
    const store = new OAuthStateStore(memoryStorage());
    expect(await store.consume('twitter', newState())).toBeNull();
  });

  it('expires records instead of keeping them forever', async () => {
    const storage = memoryStorage();
    await new OAuthStateStore(storage).save('twitter', newState(), { wallet: '0x1' });
    expect(storage.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 600);
  });

  it('ignores malformed input without touching storage', async () => {
    const storage = memoryStorage();
    const store = new OAuthStateStore(storage);

    for (const bad of ['', 'abc', 'x'.repeat(32), '../../etc', 42, null, undefined, ['a']]) {
      expect(await store.consume('twitter', bad)).toBeNull();
    }
    expect(storage.getDel).not.toHaveBeenCalled();
    await expect(store.save('twitter', 'not-hex', { wallet: '0x1' })).rejects.toThrow(/malformed/);
  });

  it('treats a corrupted record as missing', async () => {
    const storage = memoryStorage();
    const state = newState();
    storage.data.set(`oauth:state:twitter:${state}`, '{not json');
    expect(await new OAuthStateStore(storage).consume('twitter', state)).toBeNull();
  });
});
