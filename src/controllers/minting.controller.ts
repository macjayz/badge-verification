import { Request, Response } from 'express';
import { mintingService } from '../services/minting.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class MintingController {
  async initiateMint(req: AuthenticatedRequest, res: Response) {
    try {
      const { badgeTypeKey, verificationId } = req.body;
      const wallet = req.user?.wallet;

      if (!wallet || !badgeTypeKey) {
        return res.status(400).json({
          success: false,
          error: 'Wallet and badge type key are required'
        });
      }

      // Check if user can mint this badge
      const canMint = await mintingService.canMintBadge(wallet, badgeTypeKey);
      
      if (!canMint.canMint) {
        return res.status(400).json({
          success: false,
          error: canMint.reason,
          existingMint: canMint.existingMint
        });
      }

      const result = await mintingService.initiateMint(wallet, badgeTypeKey, verificationId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        mintId: result.mintId,
        message: 'Mint initiated successfully'
      });

    } catch (error) {
      logger.error('Initiate mint error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate mint'
      });
    }
  }

  async getMintStatus(req: Request, res: Response) {
    try {
      const { mintId } = req.params;
      
      const mint = await mintingService.getMintStatus(mintId);

      if (!mint) {
        return res.status(404).json({
          success: false,
          error: 'Mint not found'
        });
      }

      res.json({
        success: true,
        mint: {
          id: mint.id,
          wallet: mint.wallet,
          status: mint.metadata?.status || 'unknown',
          tokenId: mint.tokenId,
          transactionHash: mint.transactionHash,
          badgeType: mint.badgeType,
          isRevoked: mint.isRevoked,
          createdAt: mint.createdAt,
          updatedAt: mint.updatedAt,
          metadata: mint.metadata
        }
      });

    } catch (error) {
      logger.error('Get mint status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get mint status'
      });
    }
  }

  async getUserMints(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
      }

      const mints = await mintingService.getUserMints(wallet);

      res.json({
        success: true,
        mints: mints.map(mint => ({
          id: mint.id,
          wallet: mint.wallet,
          status: mint.metadata?.status || 'unknown',
          tokenId: mint.tokenId,
          transactionHash: mint.transactionHash,
          badgeType: mint.badgeType,
          isRevoked: mint.isRevoked,
          createdAt: mint.createdAt,
          updatedAt: mint.updatedAt
        }))
      });

    } catch (error) {
      logger.error('Get user mints error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user mints'
      });
    }
  }

  async getActiveBadges(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
      }

      const activeBadges = await mintingService.getActiveUserBadges(wallet);

      res.json({
        success: true,
        badges: activeBadges.map(mint => ({
          id: mint.id,
          tokenId: mint.tokenId,
          transactionHash: mint.transactionHash,
          badgeType: mint.badgeType,
          mintedAt: mint.createdAt,
          transactionUrl: mint.metadata?.transactionUrl
        }))
      });

    } catch (error) {
      logger.error('Get active badges error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active badges'
      });
    }
  }

  async checkMintEligibility(req: AuthenticatedRequest, res: Response) {
    try {
      const { badgeTypeKey } = req.body;
      const wallet = req.user?.wallet;

      if (!wallet || !badgeTypeKey) {
        return res.status(400).json({
          success: false,
          error: 'Wallet and badge type key are required'
        });
      }

      const canMint = await mintingService.canMintBadge(wallet, badgeTypeKey);

      res.json({
        success: true,
        canMint: canMint.canMint,
        reason: canMint.reason,
        existingMint: canMint.existingMint
      });

    } catch (error) {
      logger.error('Check mint eligibility error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check mint eligibility'
      });
    }
  }

  async revokeBadge(req: AuthenticatedRequest, res: Response) {
    try {
      const { mintId, reason } = req.body;

      if (!mintId || !reason) {
        return res.status(400).json({
          success: false,
          error: 'Mint ID and reason are required'
        });
      }

      // TODO: Add authorization check - only issuer should be able to revoke

      const success = await mintingService.revokeBadge(mintId, reason);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'Failed to revoke badge'
        });
      }

      res.json({
        success: true,
        message: 'Badge revoked successfully'
      });

    } catch (error) {
      logger.error('Revoke badge error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to revoke badge'
      });
    }
  }
}

export const mintingController = new MintingController();