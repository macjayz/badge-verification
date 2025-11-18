import { PolygonIDStubAdapter } from '../adapters/did/PolygonIDStubAdapter';
import { IdOSStubAdapter } from '../adapters/did/IdOSStubAdapter';
import { PolygonIDRealAdapter } from '../adapters/did/PolygonIDRealAdapter';
import { IdOSRealAdapter } from '../adapters/did/IdOSRealAdapter';
import { logger } from '../utils/logger';

export class DIDService {
  private adapters: Map<string, any> = new Map();

  constructor() {
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const useRealAdapters = process.env.USE_REAL_ADAPTERS === 'true';
    
    if (useRealAdapters) {
      // Register real adapters
      const polygonIDAdapter = new PolygonIDRealAdapter();
      const idOSAdapter = new IdOSRealAdapter();

      this.adapters.set(polygonIDAdapter.getName(), polygonIDAdapter);
      this.adapters.set(idOSAdapter.getName(), idOSAdapter);

      logger.info(`DID Service initialized with REAL adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
    } else {
      // Register stub adapters (current behavior)
      const polygonIDAdapter = new PolygonIDStubAdapter();
      const idOSAdapter = new IdOSStubAdapter();

      this.adapters.set(polygonIDAdapter.getName(), polygonIDAdapter);
      this.adapters.set(idOSAdapter.getName(), idOSAdapter);

      logger.info(`DID Service initialized with STUB adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
  }

  getAdapter(provider: string): any | null {
    const adapter = this.adapters.get(provider.toLowerCase());
    if (!adapter) {
      logger.warn(`DID adapter not found for provider: ${provider}`);
      return null;
    }

    if (!adapter.isAvailable()) {
      logger.warn(`DID adapter not available for provider: ${provider}`);
      return null;
    }

    return adapter;
  }

  getAvailableAdapters(): string[] {
    return Array.from(this.adapters.values())
      .filter(adapter => adapter.isAvailable())
      .map(adapter => adapter.getName());
  }

  async initVerification(provider: string, request: any): Promise<any> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      return {
        success: false,
        error: `DID provider '${provider}' not available`
      };
    }

    try {
      logger.info(`Initializing DID verification for ${provider}, wallet: ${request.wallet}`);
      const result = await adapter.initVerification(request);
      
      if (result.success) {
        logger.info(`DID verification initiated successfully for ${provider}, session: ${result.sessionId}`);
      } else {
        logger.warn(`DID verification initiation failed for ${provider}: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error initializing DID verification for ${provider}:`, error);
      return {
        success: false,
        error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleCallback(provider: string, payload: any, sessionId?: string): Promise<any> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      return {
        success: false,
        error: `DID provider '${provider}' not available`
      };
    }

    try {
      logger.info(`Handling DID callback for ${provider}, session: ${sessionId}`);
      const result = await adapter.verifyCallback(payload, sessionId);
      
      if (result.success) {
        logger.info(`DID verification successful for ${provider}, DID: ${result.did}`);
      } else {
        logger.warn(`DID verification failed for ${provider}: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error handling DID callback for ${provider}:`, error);
      return {
        success: false,
        error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  registerAdapter(adapter: any): void {
    this.adapters.set(adapter.getName(), adapter);
    logger.info(`Registered new DID adapter: ${adapter.getName()}`);
  }

  // New method: Check adapter health
  async checkAdapterHealth(provider: string): Promise<boolean> {
    const adapter = this.getAdapter(provider);
    if (!adapter) return false;

    try {
      // Simple health check for real adapters
      if (adapter instanceof PolygonIDRealAdapter || adapter instanceof IdOSRealAdapter) {
        const testResult = await adapter.initVerification({
          wallet: '0x0000000000000000000000000000000000000000',
          callbackUrl: 'http://localhost:3000/test-callback'
        });
        return testResult.success !== false; // Consider it healthy if it doesn't explicitly fail
      }
      return true; // Stub adapters are always healthy
    } catch (error) {
      logger.warn(`Health check failed for ${provider}:`, error);
      return false;
    }
  }

  // New method: Get adapter details
  getAdapterDetails(provider: string): any {
    const adapter = this.getAdapter(provider);
    if (!adapter) return null;

    return {
      name: adapter.getName(),
      type: adapter instanceof PolygonIDRealAdapter || adapter instanceof PolygonIDStubAdapter ? 'polygonid' : 'idos',
      isReal: adapter instanceof PolygonIDRealAdapter || adapter instanceof IdOSRealAdapter,
      isAvailable: adapter.isAvailable()
    };
  }
}

// Create and export singleton instance
export const didService = new DIDService();