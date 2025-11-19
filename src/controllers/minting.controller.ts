// src/controllers/minting.controller.ts
import { Request, Response } from 'express';
import { mintingService } from '../services/minting.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { 
  ValidationError, 
  AuthenticationError,
  NotFoundError 
} from '../utils/errors';

export class MintingController {
  
  initiateMint = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { badgeTypeKey, verificationId } = req.body;
    const wallet = req.user?.wallet;

    if (!wallet) {
      throw new AuthenticationError('User wallet not found in session');
    }

    if (!badgeTypeKey) {
      throw new ValidationError('Badge type key is required', {
        field: 'badgeTypeKey',
        required: true
      });
    }

    // Check if user can mint this badge
    const canMint = await mintingService.canMintBadge(wallet, badgeTypeKey);
    
    if (!canMint.canMint) {
      throw new ValidationError(
        `Cannot mint badge: ${canMint.reason}`,
        {
          badgeTypeKey,
          wallet,
          existingMint: canMint.existingMint,
          suggestion: canMint.suggestion || 'Check your eligibility or contact support'
        }
      );
    }

    const result = await mintingService.initiateMint(wallet, badgeTypeKey, verificationId);

    if (!result.success) {
      throw new ValidationError(
        result.error || 'Mint initiation failed',
        { badgeTypeKey, wallet }
      );
    }

    res.json({
      success: true,
      data: {
        mintId: result.mintId,
        transactionHash: result.transactionHash,
        message: 'Mint initiated successfully',
        nextSteps: [
          'Transaction submitted to blockchain',
          'Wait for confirmation (usually 1-2 minutes)',
          'Check mint status using the mintId'
        ]
      }
    });
  });

  getMintStatus = asyncHandler(async (req: Request, res: Response) => {
    const { mintId } = req.params;
    
    if (!mintId) {
      throw new ValidationError('Mint ID is required', {
        field: 'mintId',
        required: true,
        suggestion: 'Provide a valid mint ID from the initiation response'
      });
    }

    const mint = await mintingService.getMintStatus(mintId);

    if (!mint) {
      throw new NotFoundError('Mint record', mintId);
    }

    res.json({
      success: true,
      data: {
        id: mint.id,
        wallet: mint.wallet,
        status: mint.metadata?.status || 'unknown',
        tokenId: mint.tokenId,
        transactionHash: mint.transactionHash,
        badgeType: mint.badgeType,
        isRevoked: mint.isRevoked,
        createdAt: mint.createdAt,
        updatedAt: mint.updatedAt,
        metadata: mint.metadata,
        // Add helpful status information
        statusInfo: this.getStatusInfo(mint.metadata?.status)
      }
    });
  });

  getUserMints = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wallet = req.user?.wallet;

    if (!wallet) {
      throw new AuthenticationError('User wallet not found in session');
    }

    const mints = await mintingService.getUserMints(wallet);

    res.json({
      success: true,
      data: {
        wallet,
        totalMints: mints.length,
        mints: mints.map(mint => ({
          id: mint.id,
          wallet: mint.wallet,
          status: mint.metadata?.status || 'unknown',
          tokenId: mint.tokenId,
          transactionHash: mint.transactionHash,
          badgeType: mint.badgeType,
          isRevoked: mint.isRevoked,
          createdAt: mint.createdAt,
          updatedAt: mint.updatedAt,
          statusInfo: this.getStatusInfo(mint.metadata?.status)
        }))
      }
    });
  });

  getActiveBadges = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const wallet = req.user?.wallet;

    if (!wallet) {
      throw new AuthenticationError('User wallet not found in session');
    }

    const activeBadges = await mintingService.getActiveUserBadges(wallet);

    res.json({
      success: true,
      data: {
        wallet,
        totalBadges: activeBadges.length,
        badges: activeBadges.map(mint => ({
          id: mint.id,
          tokenId: mint.tokenId,
          transactionHash: mint.transactionHash,
          badgeType: mint.badgeType,
          mintedAt: mint.createdAt,
          transactionUrl: mint.metadata?.transactionUrl,
          badgeMetadata: mint.metadata?.badgeMetadata
        }))
      }
    });
  });

  checkMintEligibility = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { badgeTypeKey } = req.body;
    const wallet = req.user?.wallet;

    if (!wallet) {
      throw new AuthenticationError('User wallet not found in session');
    }

    if (!badgeTypeKey) {
      throw new ValidationError('Badge type key is required', {
        field: 'badgeTypeKey',
        required: true
      });
    }

    const canMint = await mintingService.canMintBadge(wallet, badgeTypeKey);

    res.json({
      success: true,
      data: {
        canMint: canMint.canMint,
        reason: canMint.reason,
        existingMint: canMint.existingMint,
        suggestion: canMint.suggestion,
        wallet,
        badgeTypeKey,
        timestamp: new Date().toISOString()
      }
    });
  });

  revokeBadge = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { mintId, reason } = req.body;

    if (!mintId) {
      throw new ValidationError('Mint ID is required', {
        field: 'mintId',
        required: true
      });
    }

    if (!reason) {
      throw new ValidationError('Revocation reason is required', {
        field: 'reason',
        required: true,
        suggestion: 'Provide a clear reason for revocation (e.g., "violation of terms", "user request")'
      });
    }

    // TODO: Add authorization check - only issuer should be able to revoke
    // For now, this is a placeholder for authorization
    const isAuthorized = true; // Replace with actual authorization logic
    
    if (!isAuthorized) {
      throw new AuthenticationError('Not authorized to revoke badges');
    }

    const success = await mintingService.revokeBadge(mintId, reason);

    if (!success) {
      throw new ValidationError('Failed to revoke badge', {
        mintId,
        reason,
        suggestion: 'Check if the mint ID exists and the badge is not already revoked'
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Badge revoked successfully',
        mintId,
        reason,
        revokedAt: new Date().toISOString()
      }
    });
  });

  // Helper method to provide status information
  private getStatusInfo(status: string): any {
    const statusInfo: { [key: string]: any } = {
      'pending': {
        description: 'Transaction submitted to blockchain',
        expectedWait: '1-2 minutes',
        nextStep: 'Wait for blockchain confirmation'
      },
      'confirmed': {
        description: 'Transaction confirmed on blockchain',
        nextStep: 'Badge is now active in your wallet'
      },
      'failed': {
        description: 'Transaction failed',
        nextStep: 'Check transaction details and try again'
      },
      'reverted': {
        description: 'Transaction reverted on blockchain',
        nextStep: 'Contact support for assistance'
      }
    };

    return statusInfo[status] || {
      description: 'Unknown status',
      nextStep: 'Contact support for assistance'
    };
  }
}

export const mintingController = new MintingController();