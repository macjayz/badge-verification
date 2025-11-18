import { Request, Response } from 'express';
import { eligibilityService } from '../services/eligibility.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class EligibilityController {
  async checkEligibility(req: Request, res: Response) {
    try {
      const { wallet } = req.params;
      const { badgeKey } = req.query;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      if (!badgeKey || typeof badgeKey !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Badge key is required'
        });
      }

      const result = await eligibilityService.checkEligibility(wallet, badgeKey);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Check eligibility error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to check eligibility'
      });
    }
  }

  async checkUserEligibility(req: AuthenticatedRequest, res: Response) {
    try {
      const wallet = req.user?.wallet;

      if (!wallet) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const { badgeKey } = req.query;

      if (badgeKey && typeof badgeKey === 'string') {
        // Check specific badge
        const result = await eligibilityService.checkEligibility(wallet, badgeKey);
        return res.json({
          success: true,
          ...result
        });
      } else {
        // Check all badges
        const result = await eligibilityService.checkAllEligibilities(wallet);
        return res.json({
          success: true,
          ...result
        });
      }

    } catch (error) {
      logger.error('Check user eligibility error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to check eligibility'
      });
    }
  }

  async checkAllEligibilities(req: Request, res: Response) {
    try {
      const { wallet } = req.params;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const result = await eligibilityService.checkAllEligibilities(wallet);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Check all eligibilities error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to check eligibilities'
      });
    }
  }
}

export const eligibilityController = new EligibilityController();