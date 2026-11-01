//
// Server-side record of in-flight Twitter/Discord logins.
//
// The OAuth `state` value only protects anything if the server checks it. When
// a login starts we store the state against the wallet that started it; when
// the callback arrives we look it up, make sure it belongs to the same wallet,
// and delete it so it can't be replayed. Anything the callback needs later
// (issuer, PKCE verifier) is read from this record rather than trusted from
// the request body.

import { redisService } from './redis.service';
import type { OAuthProvider } from '../utils/oauth-pages';

export interface OAuthStateRecord {
  wallet: string;
  issuerId?: string;
  codeVerifier?: string;
}

interface StateStorage {
  set(key: string, value: string, expirySeconds?: number): Promise<void>;
  getDel(key: string): Promise<string | null>;
}

// Services generate state as 16 random bytes in hex.
const STATE_FORMAT = /^[a-f0-9]{32}$/;

// Long enough to get through the provider's consent screen, short enough that
// an abandoned login doesn't linger.
const DEFAULT_TTL_SECONDS = 10 * 60;

export class OAuthStateStore {
  constructor(
    private readonly storage: StateStorage,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ) {}

  private key(provider: OAuthProvider, state: string): string {
    return `oauth:state:${provider}:${state}`;
  }

  async save(provider: OAuthProvider, state: string, record: OAuthStateRecord): Promise<void> {
    if (!STATE_FORMAT.test(state)) {
      throw new Error('Refusing to store a malformed OAuth state');
    }
    const normalized: OAuthStateRecord = { ...record, wallet: record.wallet.toLowerCase() };
    await this.storage.set(this.key(provider, state), JSON.stringify(normalized), this.ttlSeconds);
  }

  /**
   * Returns the record and deletes it in one step, so a state can be used at
   * most once. Returns null for unknown, expired, already-used or malformed
   * states.
   */
  async consume(provider: OAuthProvider, state: unknown): Promise<OAuthStateRecord | null> {
    if (typeof state !== 'string' || !STATE_FORMAT.test(state)) {
      return null;
    }
    const raw = await this.storage.getDel(this.key(provider, state));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as OAuthStateRecord;
    } catch {
      return null;
    }
  }
}

export const oauthStateStore = new OAuthStateStore(redisService);
