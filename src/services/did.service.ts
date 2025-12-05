// src/services/did.service.ts
import { PrivadoIDRealAdapter } from '../adapters/did/PrivadoIDRealAdapter';
import { IdOSRealAdapter } from '../adapters/did/IdOSRealAdapter';
import { logger } from '../utils/logger';
import { 
  DIDProviderError, 
  ValidationError, 
  ConfigurationError
} from '../utils/errors';

export class DIDService {
  private adapters: Map<string, any> = new Map();

  constructor() {
    this.initializeRealAdapters();
  }

  private initializeRealAdapters(): void {
    try {
      logger.info('🚀 Initializing REAL DID adapters only (no stubs)...');
      
      let adaptersRegistered = 0;
      
      // 1. Initialize Privado ID adapter (REQUIRED)
      const privadoIDAdapter = new PrivadoIDRealAdapter();
      if (privadoIDAdapter.isAvailable()) {
        this.adapters.set(privadoIDAdapter.getName(), privadoIDAdapter);
        adaptersRegistered++;
        logger.info(`✅ Registered Privado ID adapter: ${privadoIDAdapter.getName()}`);
      } else {
        logger.error('❌ Privado ID adapter NOT available - missing PRIVADO_API_KEY');
        logger.info('📝 Get API key from: https://developer.privado.id');
      }
      
      // 2. Initialize IdOS adapter (OPTIONAL)
      const idOSAdapter = new IdOSRealAdapter();
      if (idOSAdapter.isAvailable()) {
        this.adapters.set(idOSAdapter.getName(), idOSAdapter);
        adaptersRegistered++;
        logger.info(`✅ Registered IdOS adapter: ${idOSAdapter.getName()}`);
      } else {
        logger.warn('⚠️  IdOS adapter not available (optional)');
      }
      
      // Check if at least Privado ID is available
      if (!privadoIDAdapter.isAvailable()) {
        throw new ConfigurationError(
          'DIDService',
          'Privado ID adapter not configured. Set PRIVADO_API_KEY in environment variables.'
        );
      }
      
      logger.info(`🎉 DID Service initialized with ${adaptersRegistered} real adapter(s)`);
      
    } catch (error: any) {
      logger.error('💥 Failed to initialize DID adapters:', error);
      throw new ConfigurationError(
        'DIDService',
        `Failed to initialize real adapters: ${error.message}`
      );
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
          suggestion: `Available providers: ${Array.from(this.adapters.keys()).join(', ')}`
        }
      );
    }

    if (!adapter.isAvailable()) {
      throw new DIDProviderError(
        provider,
        'Adapter not available or not configured',
        {
          suggestion: `Check ${provider.toUpperCase()}_API_KEY in environment variables`
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
      logger.info(`🔐 Initializing ${provider} verification for wallet: ${request.wallet}`);
      const result = await adapter.initVerification(request);
      
      if (result.success) {
        logger.info(`✅ ${provider} verification initiated, session: ${result.sessionId}`);
      } else {
        logger.warn(`❌ ${provider} verification initiation failed: ${result.error}`);
        throw new DIDProviderError(
          provider,
          result.error || 'Verification initiation failed',
          { wallet: request.wallet }
        );
      }
      
      return result;
    } catch (error: any) {
      if (error instanceof DIDProviderError) throw error;
      
      logger.error(`💥 Error initializing ${provider} verification:`, error);
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
      logger.info(`📨 Handling ${provider} callback, session: ${sessionId}`);
      const result = await adapter.verifyCallback(payload, sessionId);
      
      if (result.success) {
        logger.info(`✅ ${provider} verification successful, DID: ${result.did}`);
      } else {
        logger.warn(`❌ ${provider} verification failed: ${result.error}`);
        throw new DIDProviderError(
          provider,
          result.error || 'Verification rejected by provider',
          { sessionId }
        );
      }
      
      return result;
    } catch (error: any) {
      if (error instanceof DIDProviderError) throw error;
      
      logger.error(`💥 Error handling ${provider} callback:`, error);
      throw new DIDProviderError(
        provider,
        `Callback handling failed: ${error.message}`,
        { sessionId }
      );
    }
  }

  async checkAdapterHealth(provider: string): Promise<{ healthy: boolean; details: any }> {
    try {
      const adapter = this.getAdapter(provider);
      
      if (!adapter.isAvailable()) {
        return {
          healthy: false,
          details: {
            available: false,
            message: 'Adapter not available or not configured',
            suggestion: `Set ${provider.toUpperCase()}_API_KEY in environment`,
            status: 'unavailable'
          }
        };
      }
      
      // Test the adapter with a minimal request
      const testRequest = {
        wallet: '0x0000000000000000000000000000000000000000',
        callbackUrl: 'http://localhost:3000/test-callback',
        provider: provider
      };
      
      const result = await adapter.initVerification(testRequest);
      
      return {
        healthy: result.success !== false,
        details: {
          available: true,
          testResult: result.success ? 'healthy' : 'unhealthy',
          adapterType: adapter.constructor.name,
          status: result.success ? 'operational' : 'degraded'
        }
      };
    } catch (error: any) {
      logger.warn(`⚠️  Health check failed for ${provider}:`, error);
      return {
        healthy: false,
        details: {
          available: false,
          error: error.message,
          message: `Health check failed: ${error.message}`,
          status: 'failed'
        }
      };
    }
  }

  getAdapterDetails(provider: string): any {
    try {
      const adapter = this.getAdapter(provider);
      
      return {
        name: adapter.getName(),
        type: adapter instanceof PrivadoIDRealAdapter ? 'privadoid' : 'idos',
        isReal: true, // All adapters are real now
        isAvailable: adapter.isAvailable(),
        configured: adapter.isAvailable(),
        adapterClass: adapter.constructor.name,
        supports: adapter instanceof PrivadoIDRealAdapter 
          ? ['age_verification', 'identity_verification'] 
          : ['social_verification', 'data_sharing']
      };
    } catch (error) {
      return {
        name: provider,
        isReal: true,
        isAvailable: false,
        configured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'unavailable'
      };
    }
  }

  getAllAdaptersStatus(): any[] {
    return Array.from(this.adapters.keys()).map(provider => 
      this.getAdapterDetails(provider)
    );
  }

  // Get system status summary
  getSystemStatus(): { status: string; adapters: any[]; summary: any } {
    const adapters = this.getAllAdaptersStatus();
    const healthyCount = adapters.filter(a => a.isAvailable).length;
    const totalCount = adapters.length;
    
    return {
      status: healthyCount === totalCount ? 'operational' : 'degraded',
      adapters,
      summary: {
        total: totalCount,
        healthy: healthyCount,
        unhealthy: totalCount - healthyCount,
        primaryAvailable: adapters.some(a => a.name === 'privadoid' && a.isAvailable)
      }
    };
  }
}

// Create and export singleton instance
export const didService = new DIDService();