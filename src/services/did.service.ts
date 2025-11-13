import { PolygonIDStubAdapter } from '../adapters/did/PolygonIDStubAdapter';
import { IdOSStubAdapter } from '../adapters/did/IdOSStubAdapter';
import { logger } from '../utils/logger';

export class DIDService {
  private adapters: Map<string, any> = new Map(); // Use any for now

  constructor() {
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // Register stub adapters for now
    const polygonIDAdapter = new PolygonIDStubAdapter();
    const idOSAdapter = new IdOSStubAdapter();

    this.adapters.set(polygonIDAdapter.getName(), polygonIDAdapter);
    this.adapters.set(idOSAdapter.getName(), idOSAdapter);

    logger.info(`DID Service initialized with adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
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
}

// Create and export singleton instance
export const didService = new DIDService();