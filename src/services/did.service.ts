// src/services/did.service.ts
import { PolygonIDStubAdapter } from '../adapters/did/PolygonIDStubAdapter';
import { IdOSStubAdapter } from '../adapters/did/IdOSStubAdapter';
import { PolygonIDRealAdapter } from '../adapters/did/PolygonIDRealAdapter';
import { IdOSRealAdapter } from '../adapters/did/IdOSRealAdapter';
import { logger } from '../utils/logger';
import { 
  DIDProviderError, 
  ValidationError, 
  ConfigurationError
} from '../utils/errors'; // ADD THIS IMPORT

export class DIDService {
  private adapters: Map<string, any> = new Map();

  constructor() {
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const useRealAdapters = process.env.USE_REAL_ADAPTERS === 'true';
    
    if (useRealAdapters) {
      try {
        // Register real adapters
        const polygonIDAdapter = new PolygonIDRealAdapter();
        const idOSAdapter = new IdOSRealAdapter();

        this.adapters.set(polygonIDAdapter.getName(), polygonIDAdapter);
        this.adapters.set(idOSAdapter.getName(), idOSAdapter);

        logger.info(`DID Service initialized with REAL adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
      } catch (error: any) {
        throw new ConfigurationError(
          'DIDService',
          `Failed to initialize real adapters: ${error.message}`
        );
      }
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
    const normalizedProvider = provider.toLowerCase();
    const adapter = this.adapters.get(normalizedProvider);
    
    if (!adapter) {
      throw new ValidationError(
        `Unsupported DID provider: ${provider}`,
        { 
          supportedProviders: Array.from(this.adapters.keys()),
          suggestion: `Use one of the supported providers: ${Array.from(this.adapters.keys()).join(', ')}`
        }
      );
    }

    if (!adapter.isAvailable()) {
      throw new DIDProviderError(
        provider,
        'Adapter not available or not configured',
        {
          suggestion: 'Check adapter configuration and environment variables'
        }
      );
    }

    return adapter;
  }

  getAvailableAdapters(): string[] {
    return Array.from(this.adapters.values())
      .filter(adapter => adapter.isAvailable())
      .map(adapter => adapter.getName());
  }

  async initVerification(provider: string, request: any): Promise<any> {
    // Validate request
    if (!request?.wallet) {
      throw new ValidationError('Wallet address is required for verification', {
        field: 'wallet',
        required: true
      });
    }

    const adapter = this.getAdapter(provider);

    try {
      logger.info(`Initializing DID verification for ${provider}, wallet: ${request.wallet}`);
      const result = await adapter.initVerification(request);
      
      if (result.success) {
        logger.info(`DID verification initiated successfully for ${provider}, session: ${result.sessionId}`);
      } else {
        logger.warn(`DID verification initiation failed for ${provider}: ${result.error}`);
        throw new DIDProviderError(
          provider,
          result.error || 'Verification initiation failed',
          { wallet: request.wallet }
        );
      }
      
      return result;
    } catch (error: any) {
      if (error instanceof DIDProviderError) throw error;
      
      logger.error(`Error initializing DID verification for ${provider}:`, error);
      throw new DIDProviderError(
        provider,
        `Failed to initialize verification: ${error.message}`,
        { wallet: request.wallet }
      );
    }
  }

  async handleCallback(provider: string, payload: any, sessionId?: string): Promise<any> {
    if (!payload) {
      throw new ValidationError('Callback payload is required');
    }

    const adapter = this.getAdapter(provider);

    try {
      logger.info(`Handling DID callback for ${provider}, session: ${sessionId}`);
      const result = await adapter.verifyCallback(payload, sessionId);
      
      if (result.success) {
        logger.info(`DID verification successful for ${provider}, DID: ${result.did}`);
      } else {
        logger.warn(`DID verification failed for ${provider}: ${result.error}`);
        throw new DIDProviderError(
          provider,
          result.error || 'Verification rejected by provider',
          { sessionId }
        );
      }
      
      return result;
    } catch (error: any) {
      if (error instanceof DIDProviderError) throw error;
      
      logger.error(`Error handling DID callback for ${provider}:`, error);
      throw new DIDProviderError(
        provider,
        `Callback handling failed: ${error.message}`,
        { sessionId }
      );
    }
  }

  registerAdapter(adapter: any): void {
    if (!adapter || !adapter.getName) {
      throw new ValidationError('Invalid adapter provided');
    }

    this.adapters.set(adapter.getName(), adapter);
    logger.info(`Registered new DID adapter: ${adapter.getName()}`);
  }

  async checkAdapterHealth(provider: string): Promise<{ healthy: boolean; details: any }> {
    try {
      const adapter = this.getAdapter(provider);
      
      // Check if adapter is available (configured properly)
      if (!adapter.isAvailable()) {
        return {
          healthy: false,
          details: {
            available: false,
            message: 'Adapter not available or not configured'
          }
        };
      }
      
      // For health check, create a minimal valid request
      const testRequest = {
        wallet: '0x0000000000000000000000000000000000000000',
        callbackUrl: 'http://localhost:3000/test-callback',
        provider: provider
      };
      
      // Try to call initVerification with test data
      const result = await adapter.initVerification(testRequest);
      
      return {
        healthy: result.success !== false,
        details: {
          available: true,
          testResult: result.success ? 'healthy' : 'unhealthy',
          adapterType: adapter.constructor.name
        }
      };
    } catch (error: any) {
      logger.warn(`Health check failed for ${provider}:`, error);
      return {
        healthy: false,
        details: {
          available: false,
          error: error.message,
          message: `Health check failed: ${error.message}`
        }
      };
    }
  }

  getAdapterDetails(provider: string): any {
    try {
      const adapter = this.getAdapter(provider);
      
      return {
        name: adapter.getName(),
        type: adapter instanceof PolygonIDRealAdapter || adapter instanceof PolygonIDStubAdapter ? 'polygonid' : 'idos',
        isReal: adapter instanceof PolygonIDRealAdapter || adapter instanceof IdOSRealAdapter,
        isAvailable: adapter.isAvailable(),
        adapterClass: adapter.constructor.name
      };
    } catch (error) {
      return {
        name: provider,
        isAvailable: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get all adapters status
  getAllAdaptersStatus(): any[] {
    return Array.from(this.adapters.keys()).map(provider => 
      this.getAdapterDetails(provider)
    );
  }
}

// Create and export singleton instance
export const didService = new DIDService();