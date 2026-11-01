import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';

export class DashboardController {
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

  // Recent Mints for Admin
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

  // User Management Data
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

  // Badge Analytics
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

  // System Health
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

  // Minting Activity Over Time
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

}

export const dashboardController = new DashboardController();