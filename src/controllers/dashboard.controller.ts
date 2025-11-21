// File: src/controllers/dashboard.controller.ts
import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AppDataSource } from '../db/datasource';

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

  // NEW: Admin Dashboard Statistics
  async getAdminStats(req: Request, res: Response) {
    try {
      const stats = await dashboardService.getAdminStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get admin stats error:', error);
      // Fix: Handle unknown error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        success: false,
        error: 'Failed to get admin statistics',
        details: errorMessage
      });
    }
  }

  // NEW: Recent Mints for Admin
  async getRecentMints(req: Request, res: Response) {
    try {
      const { limit = 20, page = 1 } = req.query;

      const mints = await dashboardService.getRecentMints(
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: mints,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get recent mints error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent mints'
      });
    }
  }

  // NEW: User Management Data
  async getUserManagement(req: Request, res: Response) {
    try {
      const { limit = 20, page = 1 } = req.query;

      const users = await dashboardService.getUserManagementData(
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: users,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get user management error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user management data'
      });
    }
  }

  // NEW: Badge Analytics
  async getBadgeAnalytics(req: Request, res: Response) {
    try {
      const analytics = await dashboardService.getBadgeAnalytics();

      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get badge analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge analytics'
      });
    }
  }

  // NEW: System Health
  async getSystemHealth(req: Request, res: Response) {
    try {
      const health = await dashboardService.getSystemHealth();

      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get system health error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system health'
      });
    }
  }

  // NEW: Minting Activity Over Time
  async getMintingActivity(req: Request, res: Response) {
    try {
      const { timeRange = '24h' } = req.query;

      const activity = await dashboardService.getMintingActivity(timeRange as string);

      res.json({
        success: true,
        data: activity,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get minting activity error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get minting activity'
      });
    }
  }

  // NEW: Debug Database
  async debugDatabase(req: Request, res: Response) {
    try {
      const badgeMintRepo = AppDataSource.getRepository('BadgeMint');
      const userRepo = AppDataSource.getRepository('User'); 
      const badgeTypeRepo = AppDataSource.getRepository('BadgeType');

      const badgeMintCount = await badgeMintRepo.count();
      const userCount = await userRepo.count();
      const badgeTypeCount = await badgeTypeRepo.count();
      
      // Get a sample of recent mints
      const sampleMints = await badgeMintRepo.find({
        take: 5,
        order: { createdAt: 'DESC' }
      });

      res.json({
        success: true,
        counts: {
          badgeMints: badgeMintCount,
          users: userCount,
          badgeTypes: badgeTypeCount
        },
        sampleMints: sampleMints.map(mint => ({
          id: mint.id,
          wallet: mint.wallet,
          status: mint.metadata?.status,
          createdAt: mint.createdAt
        }))
      });
    } catch (error) {
      logger.error('Debug database error:', error);
      // Fix: Handle unknown error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        success: false,
        error: 'Debug failed',
        details: errorMessage
      });
    }
  }
}

export const dashboardController = new DashboardController();