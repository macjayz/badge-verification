import { Request, Response } from 'express';
import { verificationService } from '../services/verification.service';
import { didService } from '../services/did.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class DIDController {
  async getAvailableProviders(req: Request, res: Response) {
    try {
      const providers = didService.getAvailableAdapters();
      
      res.json({
        success: true,
        providers: providers.map(provider => ({
          name: provider,
          type: 'primary_did' // All current providers are for primary DID
        }))
      });
    } catch (error) {
      logger.error('Get available providers error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get available providers' 
      });
    }
  }

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