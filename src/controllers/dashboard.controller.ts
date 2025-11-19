import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class DashboardController {
  async getIssuerDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      // Use a default issuer ID for now (DeFi Camp issuer from your database)
      const issuerId = '2ffcd255-5c43-4df9-8b9e-3867c5b74035';

      const stats = await dashboardService.getIssuerDashboard(issuerId);

      res.json({
        success: true,
        issuerId,
        ...stats
      });

    } catch (error) {
      logger.error('Get issuer dashboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard data'
      });
    }
  }

  async getBadgePerformance(req: AuthenticatedRequest, res: Response) {
    try {
      const issuerId = '2ffcd255-5c43-4df9-8b9e-3867c5b74035';
      const { badgeTypeId } = req.query;

      const performance = await dashboardService.getBadgePerformance(
        issuerId, 
        badgeTypeId as string
      );

      res.json({
        success: true,
        issuerId,
        performance
      });

    } catch (error) {
      logger.error('Get badge performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge performance data'
      });
    }
  }

  async getBadgeHolders(req: AuthenticatedRequest, res: Response) {
    try {
      const issuerId = '2ffcd255-5c43-4df9-8b9e-3867c5b74035';
      const { badgeTypeId } = req.query;

      const holders = await dashboardService.getBadgeHolders(
        issuerId,
        badgeTypeId as string
      );

      res.json({
        success: true,
        issuerId,
        holders,
        totalHolders: holders.length
      });

    } catch (error) {
      logger.error('Get badge holders error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge holders data'
      });
    }
  }

  async getVerificationAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const issuerId = '2ffcd255-5c43-4df9-8b9e-3867c5b74035';

      const analytics = await dashboardService.getVerificationAnalytics(issuerId);

      res.json({
        success: true,
        issuerId,
        analytics
      });

    } catch (error) {
      logger.error('Get verification analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get verification analytics'
      });
    }
  }
}

export const dashboardController = new DashboardController();