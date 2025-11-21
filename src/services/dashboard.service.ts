// File: src/services/dashboard.service.ts
import { AppDataSource } from '../db/datasource';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
import { User } from '../entities/User';
import { logger } from '../utils/logger';

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
  totalIssuers: number;
}

export class DashboardService {
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);
  private verificationRepository = AppDataSource.getRepository(Verification);
  private issuerRepository = AppDataSource.getRepository(Issuer);
  private userRepository = AppDataSource.getRepository(User);

  async getIssuerDashboard(issuerId: string): Promise<DashboardStats> {
    try {
      // Get issuer's badge types
      const badgeTypes = await this.badgeTypeRepository.find({
        where: { issuerId },
        relations: ['mints']
      });

      // Calculate totals - safely handle possibly undefined mints
      const totalBadges = badgeTypes.length;
      const totalMints = badgeTypes.reduce((sum, badge) => sum + (badge.mints?.length || 0), 0);
      
      // Get unique users with mints
      const uniqueUsers = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .select('DISTINCT mint.wallet')
        .where('mint.badgeTypeId IN (:...badgeTypeIds)', {
          badgeTypeIds: badgeTypes.map(b => b.id)
        })
        .getCount();

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentActivity = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .leftJoinAndSelect('mint.badgeType', 'badgeType')
        .where('mint.badgeTypeId IN (:...badgeTypeIds)', {
          badgeTypeIds: badgeTypes.map(b => b.id)
        })
        .andWhere('mint.createdAt >= :date', { date: sevenDaysAgo })
        .orderBy('mint.createdAt', 'DESC')
        .limit(10)
        .getMany();

      const conversionRate = totalBadges > 0 ? (totalMints / (uniqueUsers || 1)) * 100 : 0;

      return {
        totalBadges,
        totalMints,
        activeUsers: uniqueUsers,
        conversionRate: Math.round(conversionRate * 100) / 100,
        recentActivity: recentActivity.map(mint => ({
          id: mint.id,
          wallet: mint.wallet,
          badgeName: mint.badgeType.name,
          status: mint.metadata?.status,
          createdAt: mint.createdAt
        }))
      };

    } catch (error) {
      logger.error('Get issuer dashboard error:', error);
      throw new Error('Failed to get dashboard data');
    }
  }

  async getBadgePerformance(issuerId: string, badgeTypeId?: string): Promise<BadgePerformance[]> {
    try {
      const whereClause: any = { issuerId };
      if (badgeTypeId) {
        whereClause.id = badgeTypeId;
      }

      const badgeTypes = await this.badgeTypeRepository.find({
        where: whereClause,
        relations: ['mints']
      });

      const performanceData: BadgePerformance[] = [];

      for (const badgeType of badgeTypes) {
        // Safely handle possibly undefined mints
        const mints = badgeType.mints || [];
        const successfulMints = mints.filter(mint => 
          mint.metadata?.status === 'success'
        );

        // Get recent mints (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentMints = successfulMints
          .filter(mint => new Date(mint.createdAt) >= thirtyDaysAgo)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        // Estimate eligible users (this would need real eligibility checks)
        const estimatedEligibleUsers = Math.floor(successfulMints.length * 1.5); // Mock estimation

        const conversionRate = estimatedEligibleUsers > 0 
          ? (successfulMints.length / estimatedEligibleUsers) * 100 
          : 0;

        performanceData.push({
          badgeType,
          totalMints: successfulMints.length,
          eligibleUsers: estimatedEligibleUsers,
          conversionRate: Math.round(conversionRate * 100) / 100,
          recentMints
        });
      }

      return performanceData;

    } catch (error) {
      logger.error('Get badge performance error:', error);
      throw new Error('Failed to get badge performance data');
    }
  }

  async getBadgeHolders(issuerId: string, badgeTypeId?: string): Promise<any[]> {
    try {
      const whereClause: any = { issuerId };
      if (badgeTypeId) {
        whereClause.id = badgeTypeId;
      }

      const badgeTypes = await this.badgeTypeRepository.find({
        where: whereClause
      });

      const badgeTypeIds = badgeTypes.map(b => b.id);

      // Get all successful mints for these badge types
      const holders = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .leftJoinAndSelect('mint.badgeType', 'badgeType')
        .where('mint.badgeTypeId IN (:...badgeTypeIds)', { badgeTypeIds })
        .andWhere('mint.metadata ->> \'status\' = :status', { status: 'success' })
        .andWhere('mint.isRevoked = :revoked', { revoked: false })
        .orderBy('mint.createdAt', 'DESC')
        .getMany();

      // Group by wallet and count badges
      const walletMap = new Map();
      
      holders.forEach(mint => {
        if (!walletMap.has(mint.wallet)) {
          walletMap.set(mint.wallet, {
            wallet: mint.wallet,
            badges: [],
            totalBadges: 0,
            firstMint: mint.createdAt,
            lastMint: mint.createdAt
          });
        }

        const holder = walletMap.get(mint.wallet);
        holder.badges.push({
          badgeName: mint.badgeType.name,
          badgeKey: mint.badgeType.key,
          tokenId: mint.tokenId,
          mintedAt: mint.createdAt
        });
        holder.totalBadges++;
        
        if (new Date(mint.createdAt) < new Date(holder.firstMint)) {
          holder.firstMint = mint.createdAt;
        }
        if (new Date(mint.createdAt) > new Date(holder.lastMint)) {
          holder.lastMint = mint.createdAt;
        }
      });

      return Array.from(walletMap.values());

    } catch (error) {
      logger.error('Get badge holders error:', error);
      throw new Error('Failed to get badge holders data');
    }
  }

  async getVerificationAnalytics(issuerId: string): Promise<any> {
    try {
      const badgeTypes = await this.badgeTypeRepository.find({
        where: { issuerId }
      });

      const badgeTypeIds = badgeTypes.map(b => b.id);

      // Get verifications for users who have minted badges
      const analytics = await this.verificationRepository
        .createQueryBuilder('verification')
        .leftJoin('badge_mints', 'mint', 'mint.wallet = verification.wallet')
        .where('mint.badgeTypeId IN (:...badgeTypeIds)', { badgeTypeIds })
        .andWhere('mint.metadata ->> \'status\' = :status', { status: 'success' })
        .select('verification.provider', 'provider')
        .addSelect('COUNT(DISTINCT verification.wallet)', 'userCount')
        .addSelect('COUNT(verification.id)', 'verificationCount')
        .groupBy('verification.provider')
        .getRawMany();

      return analytics;

    } catch (error) {
      logger.error('Get verification analytics error:', error);
      throw new Error('Failed to get verification analytics');
    }
  }

  // NEW: Admin Dashboard Statistics
  // In src/services/dashboard.service.ts - update the getAdminStats method
  async getAdminStats(): Promise<AdminStats> {
    try {
      logger.info('🟡 Starting getAdminStats...');
      
      // Test basic repository access first
      let totalMints = 0;
      try {
        totalMints = await this.badgeMintRepository.count();
        logger.info('✅ Total mints count:', totalMints);
      } catch (error) {
        logger.error('❌ Failed to count total mints:', error);
        throw error;
      }
      
      // Test successful mints query
      let successfulMints = 0;
      try {
        successfulMints = await this.badgeMintRepository
          .createQueryBuilder('mint')
          .where("mint.metadata ->> 'status' = :status", { status: 'success' })
          .getCount();
        logger.info('✅ Successful mints count:', successfulMints);
      } catch (error) {
        logger.error('❌ Failed to count successful mints:', error);
        throw error;
      }
  
      // Test failed mints query
      let failedMints = 0;
      try {
        failedMints = await this.badgeMintRepository
          .createQueryBuilder('mint')
          .where("mint.metadata ->> 'status' = :status", { status: 'failed' })
          .getCount();
        logger.info('✅ Failed mints count:', failedMints);
      } catch (error) {
        logger.error('❌ Failed to count failed mints:', error);
        throw error;
      }
  
      // Test pending mints query
      let pendingMints = 0;
      try {
        pendingMints = await this.badgeMintRepository
          .createQueryBuilder('mint')
          .where("mint.metadata ->> 'status' = :status", { status: 'pending' })
          .orWhere("mint.metadata ->> 'status' IS NULL")
          .getCount();
        logger.info('✅ Pending mints count:', pendingMints);
      } catch (error) {
        logger.error('❌ Failed to count pending mints:', error);
        throw error;
      }
  
      // Test active users query
      let activeUsers = 0;
      try {
        activeUsers = await this.badgeMintRepository
          .createQueryBuilder('mint')
          .select('DISTINCT mint.wallet')
          .where("mint.metadata ->> 'status' = :status", { status: 'success' })
          .getCount();
        logger.info('✅ Active users count:', activeUsers);
      } catch (error) {
        logger.error('❌ Failed to count active users:', error);
        throw error;
      }
  
      // Test other repositories
      let totalBadgeTypes = 0;
      let totalIssuers = 0;
      try {
        totalBadgeTypes = await this.badgeTypeRepository.count();
        totalIssuers = await this.issuerRepository.count();
        logger.info('✅ Badge types count:', totalBadgeTypes);
        logger.info('✅ Issuers count:', totalIssuers);
      } catch (error) {
        logger.error('❌ Failed to count badge types or issuers:', error);
        throw error;
      }
  
      // Calculate success rate
      const successRate = totalMints > 0 ? (successfulMints / totalMints) * 100 : 0;
      logger.info('✅ Success rate calculated:', successRate);
  
      // Test today's mints query
      let todayMints = 0;
try {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // FIXED: Use proper TypeORM date comparison syntax
  todayMints = await this.badgeMintRepository
    .createQueryBuilder('mint')
    .where('mint.createdAt >= :today', { today })
    .getCount();
    
  logger.info('✅ Today mints count:', todayMints);
} catch (error) {
  logger.error('❌ Failed to count today mints:', error);
  throw error;
}
  
      const result = {
        totalMints,
        successfulMints,
        pendingMints,
        failedMints,
        activeUsers,
        wsConnections: 1,
        successRate: Math.round(successRate * 100) / 100,
        todayMints,
        totalBadgeTypes,
        totalIssuers
      };
  
      logger.info('✅ getAdminStats completed successfully:', result);
      return result;
  
    } catch (error) {
      logger.error('🔴 Get admin stats COMPLETE FAILURE:', error);
      throw new Error('Failed to get admin statistics');
    }
  }

  // NEW: Recent Mints for Admin Dashboard
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

  // NEW: User Management Data - FIXED VERSION
  async getUserManagementData(page: number = 1, limit: number = 20) {
    try {
      const [users, total] = await this.userRepository.findAndCount({
        relations: ['verifications'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit
      });

      // Get mint counts for each user by wallet address
      const userMintCounts = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .select('mint.wallet', 'wallet')
        .addSelect('COUNT(*)', 'mintCount')
        .addSelect(`COUNT(CASE WHEN mint.metadata ->> 'status' = 'success' THEN 1 END)`, 'successCount')
        .groupBy('mint.wallet')
        .getRawMany();

      const mintCountMap = new Map();
      userMintCounts.forEach(item => {
        mintCountMap.set(item.wallet, {
          totalMints: parseInt(item.mintCount),
          successMints: parseInt(item.successCount)
        });
      });

      const formattedUsers = users.map(user => {
        // Get the user's wallet address - check different possible property names
        const walletAddress = (user as any).walletAddress || (user as any).wallet || user.id;
        
        const latestVerification = user.verifications && user.verifications.length > 0 
          ? user.verifications.reduce((latest: any, current: any) => 
              new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
            )
          : null;

        const mintData = mintCountMap.get(walletAddress) || { totalMints: 0, successMints: 0 };

        return {
          id: user.id,
          walletAddress: walletAddress,
          verificationStatus: latestVerification?.status || 'not_verified',
          verifiedAt: latestVerification?.createdAt, // Use createdAt if verifiedAt doesn't exist
          badgesCount: mintData.successMints,
          totalMints: mintData.totalMints,
          lastActivity: (user as any).updatedAt || new Date(),
          isActive: mintData.successMints > 0, // Consider active if they have successful mints
          createdAt: (user as any).createdAt || new Date()
        };
      });

      return {
        users: formattedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get user management error:', error);
      throw new Error('Failed to get user management data');
    }
  }

  // NEW: Badge Analytics
  async getBadgeAnalytics() {
    try {
      const badgeTypes = await this.badgeTypeRepository.find({
        relations: ['mints', 'issuer']
      });

      // FIXED VERSION - in getBadgeAnalytics() method
const analytics = badgeTypes.map(badgeType => {
    const mints = badgeType.mints || [];
    
    // FIX: Count both 'success' and 'completed' as successful
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

  // NEW: System Health
  async getSystemHealth() {
    try {
      // Test database connection
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

  // NEW: Minting Activity Over Time
  async getMintingActivity(timeRange: string = '24h') {
    try {
      const now = new Date();
      let startTime = new Date();

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
          "COUNT(CASE WHEN mint.metadata ->> 'status' = 'success' THEN 1 END) as success_count",
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