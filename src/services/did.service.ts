import { DIDAdapter } from '../adapters/did/DIDAdapter.interface';
import { PrivadoIDRealAdapter } from '../adapters/did/PrivadoIDRealAdapter';
import { PrivadoIDStubAdapter } from '../adapters/did/PrivadoIDStubAdapter';
import { logger } from '../utils/logger';
import { DIDProviderError, ValidationError } from '../utils/errors';

/** Older badge rules name Privado ID by its previous brand. */
const PROVIDER_ALIASES: Record<string, string> = { polygonid: 'privadoid' };

export function canonicalProvider(provider: string): string {
  const name = provider.toLowerCase();
  return PROVIDER_ALIASES[name] ?? name;
}

export class DIDService {
  private adapters = new Map<string, DIDAdapter>();
  private readonly real = process.env.USE_REAL_ADAPTERS === 'true';

  constructor() {
    // Local development swaps in a stub so identity badges can be tried without a Privado ID
    // wallet. Production refuses to start without real adapters (see config).
    const privado = this.real ? new PrivadoIDRealAdapter() : new PrivadoIDStubAdapter();
    this.adapters.set(privado.getName(), privado);
    logger.info(`DID providers: ${privado.getName()} (${this.real ? 'live' : 'stub'})`);
  }

  getAdapter(provider: string): DIDAdapter {
    const adapter = this.adapters.get(canonicalProvider(provider));
    if (!adapter) {
      throw new ValidationError(`Unsupported DID provider: ${provider}`, {
        supportedProviders: this.getAvailableAdapters()
      });
    }
    return adapter;
  }

  getAvailableAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  async initVerification(provider: string, request: any): Promise<any> {
    if (!request?.wallet) {
      throw new ValidationError('Wallet address is required for verification', { field: 'wallet', required: true });
    }

    const result = await this.getAdapter(provider).initVerification(request);
    if (!result.success) {
      throw new DIDProviderError(provider, result.error || 'Verification initiation failed', { wallet: request.wallet });
    }
    return result;
  }

  /** Asks the provider for the session's outcome. A pending result is returned, not thrown. */
  async handleCallback(provider: string, payload: any, sessionId?: string): Promise<any> {
    const result = await this.getAdapter(provider).verifyCallback(payload ?? {}, sessionId);
    if (!result.success && !result.pending) {
      throw new DIDProviderError(provider, result.error || 'Verification rejected by provider', { sessionId });
    }
    return result;
  }

  async checkAdapterHealth(provider: string): Promise<{ healthy: boolean; details: any }> {
    try {
      const adapter = this.getAdapter(provider);
      if (!this.real) {
        return { healthy: true, details: { status: 'operational', mode: 'stub' } };
      }

      // A status lookup for a session that does not exist is cheap and proves the backend answers,
      // without creating a session on every health check.
      const base = (process.env.PRIVADO_VERIFIER_API_URL || 'https://verifier-backend.privado.id').replace(/\/$/, '');
      const response = await fetch(`${base}/status?sessionID=00000000-0000-0000-0000-000000000000`);
      const healthy = response.status < 500;
      return {
        healthy,
        details: { status: healthy ? 'operational' : 'degraded', mode: 'live', provider: adapter.getName() }
      };
    } catch (error: any) {
      return { healthy: false, details: { status: 'failed', error: error.message } };
    }
  }

  getAdapterDetails(provider: string): any {
    try {
      const adapter = this.getAdapter(provider);
      return {
        name: adapter.getName(),
        type: adapter.getName(),
        isReal: this.real,
        isAvailable: adapter.isAvailable(),
        configured: adapter.isAvailable(),
        adapterClass: adapter.constructor.name,
        supports: ['identity_verification', 'age_verification']
      };
    } catch (error) {
      return {
        name: provider,
        isReal: this.real,
        isAvailable: false,
        configured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'unavailable'
      };
    }
  }

  getAllAdaptersStatus(): any[] {
    return this.getAvailableAdapters().map(provider => this.getAdapterDetails(provider));
  }

  getSystemStatus(): { status: string; adapters: any[]; summary: any } {
    const adapters = this.getAllAdaptersStatus();
    const healthy = adapters.filter(a => a.isAvailable).length;
    return {
      status: healthy === adapters.length ? 'operational' : 'degraded',
      adapters,
      summary: {
        total: adapters.length,
        healthy,
        unhealthy: adapters.length - healthy,
        primaryAvailable: adapters.some(a => a.name === 'privadoid' && a.isAvailable)
      }
    };
  }
}

export const didService = new DIDService();
