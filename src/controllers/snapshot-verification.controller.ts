import { Response } from 'express';
import { snapshotService } from '../services/snapshot.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class SnapshotVerificationController {
  /**
   * Initiate Snapshot verification
   */
  async initiateVerification(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.body.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const result = await snapshotService.initiateVerification(wallet);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Snapshot verification initiation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Snapshot verification'
      });
    }
  }

  /**
   * Verify wallet's Snapshot voting activity
   */
  async verifyWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.body.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const { minVotes, spaceId, proposalId, timeframe } = req.body;

      const params: any = {};
      if (minVotes !== undefined) params.minVotes = parseInt(minVotes);
      if (spaceId) params.spaceId = spaceId;
      if (proposalId) params.proposalId = proposalId;
      if (timeframe) params.timeRange = {
        from: Math.floor((Date.now() - timeframe * 24 * 60 * 60 * 1000) / 1000),
        to: Math.floor(Date.now() / 1000)
      };

      const result = await snapshotService.verifyWallet(wallet, params);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Snapshot verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify Snapshot voting activity'
      });
    }
  }

  /**
   * Get wallet's Snapshot spaces
   */
  async getSpaces(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.params.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const result = await snapshotService.verifyWallet(wallet);

      res.json({
        success: true,
        data: {
          spaces: result.details.spaces ? Object.values(result.details.spaces) : [],
          totalVotes: result.details.totalVotes || 0
        }
      });

    } catch (error) {
      logger.error('Error getting Snapshot spaces:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Snapshot spaces'
      });
    }
  }

  /**
   * Check specific vote requirements
   */
  async checkRequirements(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.body.wallet;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const { spaceId, minVotes, proposalId, timeframe } = req.body;

      const requirements: any = {};
      if (spaceId) requirements.spaceId = spaceId;
      if (minVotes !== undefined) requirements.minVotes = parseInt(minVotes);
      if (proposalId) requirements.proposalId = proposalId;
      if (timeframe) requirements.timeframe = { days: parseInt(timeframe) };

      const result = await snapshotService.checkVoteRequirements(wallet, requirements);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error checking vote requirements:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check vote requirements'
      });
    }
  }

  /**
   * Get detailed vote history
   */
  async getVoteHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet || req.params.wallet;
      const { spaceId } = req.query;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const result = await snapshotService.verifyWallet(wallet, {
        spaceId: spaceId as string
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error getting vote history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get vote history'
      });
    }
  }
}

export const snapshotVerificationController = new SnapshotVerificationController();