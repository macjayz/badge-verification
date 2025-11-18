import { Request, Response } from 'express';
import { verificationService } from '../services/verification.service';
import { didService } from '../services/did.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class DIDController {
  // ✅ KEEP ALL YOUR EXISTING METHODS EXACTLY AS THEY ARE
  
  async getAvailableProviders(req: Request, res: Response) {
    try {
      const providers = didService.getAvailableAdapters();
      
      // Enhanced response with adapter details
      const providerDetails = await Promise.all(
        providers.map(async (provider) => {
          const details = didService.getAdapterDetails(provider);
          const health = await didService.checkAdapterHealth(provider);
          
          return {
            name: provider,
            type: 'primary_did',
            isReal: details?.isReal || false,
            isAvailable: details?.isAvailable || false,
            healthy: health,
            details: details
          };
        })
      );
      
      res.json({
        success: true,
        providers: providerDetails
      });
    } catch (error) {
      logger.error('Get available providers error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get available providers' 
      });
    }
  }

  // 🆕 NEW: Health check for specific provider
  async getProviderHealth(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      
      const adapter = didService.getAdapter(provider);
      if (!adapter) {
        return res.status(404).json({
          success: false,
          error: `DID provider '${provider}' not found`
        });
      }

      const health = await didService.checkAdapterHealth(provider);
      const details = didService.getAdapterDetails(provider);
      
      res.json({
        success: true,
        provider,
        healthy: health,
        details: {
          name: details?.name,
          type: details?.type,
          isReal: details?.isReal,
          isAvailable: details?.isAvailable
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Get provider health error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check provider health'
      });
    }
  }

  // 🆕 NEW: Health check for all providers
  async getAllProvidersHealth(req: Request, res: Response) {
    try {
      const providers = didService.getAvailableAdapters();
      
      const healthStatus = await Promise.all(
        providers.map(async (provider) => {
          const health = await didService.checkAdapterHealth(provider);
          const details = didService.getAdapterDetails(provider);
          
          return {
            provider,
            healthy: health,
            details: {
              name: details?.name,
              type: details?.type,
              isReal: details?.isReal,
              isAvailable: details?.isAvailable
            },
            lastChecked: new Date().toISOString()
          };
        })
      );
      
      const allHealthy = healthStatus.every(status => status.healthy);
      const anyRealAdapters = healthStatus.some(status => status.details.isReal);
      
      res.json({
        success: true,
        healthy: allHealthy,
        mode: anyRealAdapters ? 'real' : 'stub',
        providers: healthStatus,
        timestamp: new Date().toISOString(),
        summary: {
          total: healthStatus.length,
          healthy: healthStatus.filter(s => s.healthy).length,
          unhealthy: healthStatus.filter(s => !s.healthy).length,
          realAdapters: healthStatus.filter(s => s.details.isReal).length,
          stubAdapters: healthStatus.filter(s => !s.details.isReal).length
        }
      });
    } catch (error) {
      logger.error('Get all providers health error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check providers health'
      });
    }
  }

  // 🆕 NEW: Get detailed adapter information
  async getAdapterDetails(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      
      const adapter = didService.getAdapter(provider);
      if (!adapter) {
        return res.status(404).json({
          success: false,
          error: `DID provider '${provider}' not found`
        });
      }

      const details = didService.getAdapterDetails(provider);
      const health = await didService.checkAdapterHealth(provider);
      
      res.json({
        success: true,
        provider,
        healthy: health,
        details: {
          name: details?.name,
          type: details?.type,
          isReal: details?.isReal,
          isAvailable: details?.isAvailable,
          className: adapter.constructor.name,
          config: {
            useRealAdapters: process.env.USE_REAL_ADAPTERS === 'true',
            hasCredentials: details?.isAvailable
          }
        },
        endpoints: {
          initiate: `POST /api/did/${provider}/init`,
          callback: `POST /api/did/${provider}/callback`
        }
      });
    } catch (error) {
      logger.error('Get adapter details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get adapter details'
      });
    }
  }

  // 🆕 NEW: System status overview
  async getSystemStatus(req: Request, res: Response) {
    try {
      const providers = didService.getAvailableAdapters();
      const healthStatus = await Promise.all(
        providers.map(async (provider) => ({
          provider,
          healthy: await didService.checkAdapterHealth(provider)
        }))
      );

      const allHealthy = healthStatus.every(status => status.healthy);
      const status = allHealthy ? 'operational' : 'degraded';
      
      res.json({
        success: true,
        status,
        message: allHealthy 
          ? 'All DID providers are operational' 
          : 'Some DID providers are experiencing issues',
        system: {
          environment: process.env.NODE_ENV || 'development',
          adapterMode: process.env.USE_REAL_ADAPTERS === 'true' ? 'real' : 'stub',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        },
        providers: healthStatus,
        actions: {
          toggle_mode: 'Set USE_REAL_ADAPTERS=true in .env and restart service',
          check_health: 'GET /api/did/health',
          view_providers: 'GET /api/did/providers'
        }
      });
    } catch (error) {
      logger.error('Get system status error:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: 'Failed to get system status'
      });
    }
  }

  // ✅ YOUR EXISTING METHODS - KEEP THEM EXACTLY AS THEY ARE
  async initiateVerification(req: AuthenticatedRequest, res: Response) {
    try {
      const { provider } = req.params;
      const wallet = req.user?.wallet || req.body.wallet;
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
      }

      // Construct callback URL
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const callbackUrl = `${baseUrl}/api/did/${provider}/callback`;

      logger.info(`Initiating ${provider} verification for wallet: ${wallet}`);

      const result = await verificationService.initiateDIDVerification(
        wallet,
        provider,
        callbackUrl
      );

      res.json({
        success: true,
        sessionId: result.verification.sessionId,
        challenge: result.challenge,
        verification: {
          id: result.verification.id,
          status: result.verification.status,
          expiresAt: result.verification.expiresAt
        }
      });

    } catch (error) {
      logger.error(`Initiate ${req.params.provider} verification error:`, error);
      
      if (error instanceof Error) {
        if (error.message.includes('already has active')) {
          return res.status(409).json({
            success: false,
            error: error.message
          });
        }
        
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to initiate verification'
      });
    }
  }

  async handleCallback(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const { sessionId } = req.query;
      const payload = req.body;

      logger.info(`Handling ${provider} callback, session: ${sessionId}`);

      const verification = await verificationService.handleDIDVerificationCallback(
        provider,
        payload,
        sessionId as string
      );

      if (verification.status === 'completed') {
        res.json({
          success: true,
          message: 'Verification completed successfully',
          verification: {
            id: verification.id,
            did: verification.did,
            provider: verification.provider,
            completedAt: verification.completedAt
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: verification.errorMessage || 'Verification failed',
          verification: {
            id: verification.id,
            status: verification.status,
            errorMessage: verification.errorMessage
          }
        });
      }

    } catch (error) {
      logger.error(`Handle ${req.params.provider} callback error:`, error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to process verification callback'
      });
    }
  }

  async getVerificationStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.params.wallet;
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
      }

      const status = await verificationService.getUserVerificationStatus(wallet);

      res.json({
        success: true,
        wallet,
        ...status
      });

    } catch (error) {
      logger.error('Get verification status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get verification status'
      });
    }
  }

  async getVerificationSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      const verification = await verificationService.getVerificationBySessionId(sessionId);

      if (!verification) {
        return res.status(404).json({
          success: false,
          error: 'Verification session not found'
        });
      }

      // Don't expose all internal data
      res.json({
        success: true,
        verification: {
          id: verification.id,
          wallet: verification.wallet,
          provider: verification.provider,
          status: verification.status,
          sessionId: verification.sessionId,
          expiresAt: verification.expiresAt,
          createdAt: verification.createdAt
        }
      });

    } catch (error) {
      logger.error('Get verification session error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get verification session'
      });
    }
  }
}

export const didController = new DIDController();