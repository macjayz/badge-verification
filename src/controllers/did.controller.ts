// src/controllers/did.controller.ts
import { Request, Response } from 'express';
import { verificationService } from '../services/verification.service';
import { didService } from '../services/did.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware'; // ADD THIS IMPORT
import { ValidationError, AuthenticationError, NotFoundError } from '../utils/errors'; // ADD THIS IMPORT

export class DIDController {
  // ✅ UPDATE ALL METHODS TO USE asyncHandler AND THROW ENHANCED ERRORS

  getAvailableProviders = asyncHandler(async (req: Request, res: Response) => {
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
          healthy: health.healthy,
          healthDetails: health.details
        };
      })
    );
    
    res.json({
      success: true,
      providers: providerDetails
    });
  });

  // 🆕 Health check for specific provider
  getProviderHealth = asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    
    const adapter = didService.getAdapter(provider);
    if (!adapter) {
      throw new NotFoundError('DID provider', provider);
    }

    const health = await didService.checkAdapterHealth(provider);
    const details = didService.getAdapterDetails(provider);
    
    res.json({
      success: true,
      provider,
      healthy: health.healthy,
      details: {
        name: details?.name,
        type: details?.type,
        isReal: details?.isReal,
        isAvailable: details?.isAvailable,
        healthDetails: health.details
      },
      timestamp: new Date().toISOString()
    });
  });

  // 🆕 Health check for all providers
  getAllProvidersHealth = asyncHandler(async (req: Request, res: Response) => {
    const providers = didService.getAvailableAdapters();
    
    const healthStatus = await Promise.all(
      providers.map(async (provider) => {
        const health = await didService.checkAdapterHealth(provider);
        const details = didService.getAdapterDetails(provider);
        
        return {
          provider,
          healthy: health.healthy,
          details: {
            name: details?.name,
            type: details?.type,
            isReal: details?.isReal,
            isAvailable: details?.isAvailable,
            healthDetails: health.details
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
  });

  // 🆕 Get detailed adapter information
  getAdapterDetails = asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    
    const adapter = didService.getAdapter(provider);
    if (!adapter) {
      throw new NotFoundError('DID provider', provider);
    }

    const details = didService.getAdapterDetails(provider);
    const health = await didService.checkAdapterHealth(provider);
    
    res.json({
      success: true,
      provider,
      healthy: health.healthy,
      details: {
        name: details?.name,
        type: details?.type,
        isReal: details?.isReal,
        isAvailable: details?.isAvailable,
        className: adapter.constructor.name,
        config: {
          useRealAdapters: process.env.USE_REAL_ADAPTERS === 'true',
          hasCredentials: details?.isAvailable
        },
        healthDetails: health.details
      },
      endpoints: {
        initiate: `POST /api/did/${provider}/init`,
        callback: `POST /api/did/${provider}/callback`
      }
    });
  });

  // 🆕 System status overview
  getSystemStatus = asyncHandler(async (req: Request, res: Response) => {
    const providers = didService.getAvailableAdapters();
    const healthStatus = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        healthy: (await didService.checkAdapterHealth(provider)).healthy
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
  });

  // ✅ UPDATED: Use enhanced error handling
  initiateVerification = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { provider } = req.params;
    const wallet = req.user?.wallet || req.body.wallet;
    
    if (!wallet) {
      throw new ValidationError('Wallet address required', {
        field: 'wallet',
        required: true,
        suggestion: 'Provide wallet address in request body or use authenticated endpoint'
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
  });

  // ✅ UPDATED: Use enhanced error handling
  handleCallback = asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    const { sessionId } = req.query;
    const payload = req.body;

    if (!sessionId) {
      throw new ValidationError('Session ID is required', {
        field: 'sessionId',
        required: true,
        suggestion: 'Include sessionId as query parameter'
      });
    }

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
      throw new ValidationError(
        verification.errorMessage || 'Verification failed',
        {
          verificationId: verification.id,
          status: verification.status,
          provider,
          suggestion: 'Try initiating verification again'
        }
      );
    }
  });

  // ✅ UPDATED: Use enhanced error handling
  getVerificationStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wallet = req.user?.wallet || req.params.wallet;
    
    if (!wallet) {
      throw new ValidationError('Wallet address required', {
        field: 'wallet',
        required: true,
        suggestion: 'Provide wallet address as parameter or use authenticated endpoint'
      });
    }

    const status = await verificationService.getUserVerificationStatus(wallet);

    res.json({
      success: true,
      wallet,
      ...status
    });
  });

  // ✅ UPDATED: Use enhanced error handling
  getVerificationSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw new ValidationError('Session ID is required', {
        field: 'sessionId',
        required: true
      });
    }

    const verification = await verificationService.getVerificationBySessionId(sessionId);

    if (!verification) {
      throw new NotFoundError('Verification session', sessionId);
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
  });
}

export const didController = new DIDController();