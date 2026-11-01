import { AppDataSource } from '../db/datasource';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { webSocketService } from './websocket.service';

export interface DashboardStats {
  totalBadges: number;
  totalMints: number;
  activeUsers: number;
  conversionRate: number;
  recentActivity: any[];
}

export interface BadgePerformance {
  badgeType: BadgeType;
  totalMints: number;
  eligibleUsers: number;
  conversionRate: number;
  recentMints: BadgeMint[];
}

export interface AdminStats {
  totalMints: number;
  successfulMints: number;
  pendingMints: number;
  failedMints: number;
  activeUsers: number;
  wsConnections: number;
  successRate: number;
  todayMints: number;
  totalBadgeTypes: number;
  activeBadgeTypes: number;
  totalIssuers: number;
}

export class DashboardService {
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);
  private verificationRepository = AppDataSource.getRepository(Verification);
  private issuerRepository = AppDataSource.getRepository(Issuer);
  private userRepository = AppDataSource.getRepository(User);

  // Admin Dashboard Statistics
  // In src/services/dashboard.service.ts - update the getAdminStats method
  async getAdminStats(): Promise<AdminStats> {
    // Older rows recorded a minted badge as 'success'; newer ones use 'completed'.
    const status = "mint.metadata ->> 'status'";
    const counts = await this.badgeMintRepository
      .createQueryBuilder('mint')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(CASE WHEN ${status} IN ('completed', 'success') THEN 1 END)`, 'successful')
      .addSelect(`COUNT(CASE WHEN ${status} = 'failed' THEN 1 END)`, 'failed')
      .addSelect(`COUNT(CASE WHEN ${status} IS NULL OR ${status} = 'pending' THEN 1 END)`, 'pending')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${status} IN ('completed', 'success') THEN mint.wallet END)`, 'holders')
      .addSelect('COUNT(CASE WHEN mint.createdAt >= CURRENT_DATE THEN 1 END)', 'today')
      .getRawOne();

    const totalMints = Number(counts.total);
    const successfulMints = Number(counts.successful);

    return {
      totalMints,
      successfulMints,
      pendingMints: Number(counts.pending),
      failedMints: Number(counts.failed),
      activeUsers: Number(counts.holders),
      wsConnections: webSocketService.getClientCount(),
      successRate: totalMints > 0 ? Math.round((successfulMints / totalMints) * 10000) / 100 : 0,
      todayMints: Number(counts.today),
      totalBadgeTypes: await this.badgeTypeRepository.count(),
      activeBadgeTypes: await this.badgeTypeRepository.count({ where: { isActive: true } }),
      totalIssuers: await this.issuerRepository.count()
    };
  }

  async getRecentMints(page: number = 1, limit: number = 20) {
    try {
      const [mints, total] = await this.badgeMintRepository.findAndCount({
        relations: ['badgeType'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit
      });

      const formattedMints = mints.map(mint => ({
        id: mint.id,
        walletAddress: mint.wallet,
        badgeType: mint.badgeType?.name || 'Unknown',
        status: mint.metadata?.status || 'unknown',
        transactionHash: mint.transactionHash,
        createdAt: mint.createdAt,
        // Use metadata for completion time if available
        completedAt: mint.metadata?.completedAt || null,
        badgeTypeInfo: {
          name: mint.badgeType?.name,
          description: mint.badgeType?.description
        }
      }));

      return {
        mints: formattedMints,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get recent mints error:', error);
      throw new Error('Failed to get recent mints');
    }
  }

  // User Management Data
// Update the getUserManagementData method
async getUserManagementData(page: number = 1, limit: number = 20) {
  try {
    logger.info('Starting getUserManagementData...');

    // First, check if we have any users at all
    const totalUsers = await this.userRepository.count();
    logger.info(`Total users in database: ${totalUsers}`);

    if (totalUsers === 0) {
      logger.info('No users found in database');
      return {
        users: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      };
    }

    // Get users with pagination and relations
    const [users, total] = await this.userRepository.findAndCount({
      relations: ['verifications'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit
    });

    logger.info(`Found ${users.length} users for page ${page}`);

    // Get mint counts for each user by wallet
    let userMintCounts: any[] = [];
    try {
      userMintCounts = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .select('mint.wallet', 'wallet')
        .addSelect('COUNT(*)', 'mintCount')
        .addSelect(`COUNT(CASE WHEN mint.status = 'completed' THEN 1 END)`, 'successCount')
        .addSelect(`COUNT(CASE WHEN mint.metadata ->> 'status' = 'completed' THEN 1 END)`, 'successCountMetadata')
        .groupBy('mint.wallet')
        .getRawMany();
      logger.info(`Mint counts for ${userMintCounts.length} wallets`);
    } catch (error) {
      logger.error('Error getting mint counts:', error);
    }

    const mintCountMap = new Map();
    userMintCounts.forEach(item => {
      const successCount = parseInt(item.successCount) || parseInt(item.successCountMetadata) || 0;
      mintCountMap.set(item.wallet, {
        totalMints: parseInt(item.mintCount) || 0,
        successMints: successCount
      });
    });

    // Process users sequentially with proper async/await
    const formattedUsers = [];
    for (const user of users) {
      const wallet = user.wallet;
      const mintData = mintCountMap.get(wallet) || { totalMints: 0, successMints: 0 };

      // Find latest verification
      const verifications = await this.verificationRepository.find({
        where: { wallet: user.wallet }
      });

      const latestVerification = verifications.length > 0
        ? verifications.reduce((latest: any, current: any) =>
            new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
          )
        : null;

      formattedUsers.push({
        id: user.id,
        walletAddress: user.wallet, // Map to walletAddress for frontend consistency
        verificationStatus: latestVerification?.status || 'not_verified',
        verifiedAt: latestVerification?.createdAt,
        badgesCount: mintData.successMints,
        totalMints: mintData.totalMints,
        lastActivity: user.updatedAt || user.createdAt,
        isActive: mintData.successMints > 0,
        createdAt: user.createdAt
      });
    }

    const result = {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    logger.info('getUserManagementData completed successfully');
    return result;

  } catch (error) {
    logger.error('Get user management data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error('Failed to get user management data: ' + errorMessage);
  }
}
  // Badge Analytics
  async getBadgeAnalytics() {
    try {
      const badgeTypes = await this.badgeTypeRepository.find({
        relations: ['mints', 'issuer']
      });

      // In getBadgeAnalytics() method
const analytics = badgeTypes.map(badgeType => {
    const mints = badgeType.mints || [];

    // Older rows say 'success', newer ones 'completed'; both mean minted.
    const completedMints = mints.filter(mint =>
        mint.metadata?.status === 'success' || mint.metadata?.status === 'completed'
    ).length;

    const pendingMints = mints.filter(mint => mint.metadata?.status === 'pending').length;
    const failedMints = mints.filter(mint => mint.metadata?.status === 'failed').length;
    const totalMints = mints.length;

    // Debug logging
    logger.info(`Badge ${badgeType.name}: total=${totalMints}, completed=${completedMints}, failed=${failedMints}`);

    return {
        id: badgeType.id,
        name: badgeType.name,
        description: badgeType.description,
        issuer: badgeType.issuer?.name || 'Unknown',
        totalMints,
        completedMints,
        pendingMints,
        failedMints,
        successRate: totalMints > 0 ? (completedMints / totalMints) * 100 : 0
    };
});

      // Overall statistics
      const totalMints = analytics.reduce((sum, badge) => sum + badge.totalMints, 0);
      const totalCompleted = analytics.reduce((sum, badge) => sum + badge.completedMints, 0);
      const totalPending = analytics.reduce((sum, badge) => sum + badge.pendingMints, 0);
      const totalFailed = analytics.reduce((sum, badge) => sum + badge.failedMints, 0);

      return {
        badgeTypes: analytics,
        overall: {
          totalMints,
          totalCompleted,
          totalPending,
          totalFailed,
          overallSuccessRate: totalMints > 0 ? (totalCompleted / totalMints) * 100 : 0
        }
      };
    } catch (error) {
      logger.error('Get badge analytics error:', error);
      throw new Error('Failed to get badge analytics');
    }
  }

  // System Health
  async getSystemHealth() {
    try {
      let dbStatus = 'healthy';
      try {
        await this.badgeMintRepository.count();
      } catch (error) {
        dbStatus = 'unhealthy';
      }

      return {
        database: dbStatus,
        websocket: {
          connections: 1, // Simplified for now
          channels: 1,
          status: 'healthy'
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Get system health error:', error);
      throw new Error('Failed to get system health');
    }
  }

  // Minting Activity Over Time
  async getMintingActivity(timeRange: string = '24h') {
    try {
      const now = new Date();
      const startTime = new Date();

      switch (timeRange) {
        case '1h':
          startTime.setHours(now.getHours() - 1);
          break;
        case '6h':
          startTime.setHours(now.getHours() - 6);
          break;
        case '24h':
          startTime.setDate(now.getDate() - 1);
          break;
        case '7d':
          startTime.setDate(now.getDate() - 7);
          break;
        default:
          startTime.setDate(now.getDate() - 1);
      }

      // Use raw query to avoid TypeORM issues with complex grouping
      const mints = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .where('mint.createdAt >= :startTime AND mint.createdAt <= :endTime', {
          startTime,
          endTime: now
        })
        .select([
          "DATE_TRUNC('hour', mint.createdAt) as hour",
          "COUNT(*) as total_count",
          "COUNT(CASE WHEN mint.metadata ->> 'status' IN ('success', 'completed') THEN 1 END) as success_count",
          "COUNT(CASE WHEN mint.metadata ->> 'status' = 'failed' THEN 1 END) as failed_count",
          "COUNT(CASE WHEN mint.metadata ->> 'status' IS NULL OR mint.metadata ->> 'status' = 'pending' THEN 1 END) as pending_count"
        ])
        .groupBy("DATE_TRUNC('hour', mint.createdAt)")
        .orderBy('hour', 'ASC')
        .getRawMany();

      // Format data for charts
      const hourlyData = this.formatHourlyData(mints, startTime, now);

      return {
        timeRange,
        data: hourlyData,
        total: mints.reduce((sum, item) => sum + parseInt(item.total_count), 0)
      };
    } catch (error) {
      logger.error('Get minting activity error:', error);
      throw new Error('Failed to get minting activity');
    }
  }

  private formatHourlyData(mints: any[], startTime: Date, endTime: Date) {
    const hours = [];
    const current = new Date(startTime);

    while (current <= endTime) {
      hours.push(new Date(current));
      current.setHours(current.getHours() + 1);
    }

    return hours.map(hour => {
      const hourMints = mints.filter(mint => {
        const mintHour = new Date(mint.hour);
        return mintHour.getTime() === hour.getTime();
      });

      const hourData = hourMints[0] || {};

      return {
        hour: hour.toISOString(),
        successful: parseInt(hourData.success_count) || 0,
        failed: parseInt(hourData.failed_count) || 0,
        pending: parseInt(hourData.pending_count) || 0,
        total: parseInt(hourData.total_count) || 0
      };
    });
  }
}

export const dashboardService = new DashboardService();