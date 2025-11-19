import { AppDataSource } from '../db/datasource';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
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

export class DashboardService {
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);
  private verificationRepository = AppDataSource.getRepository(Verification);
  private issuerRepository = AppDataSource.getRepository(Issuer);

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
}

export const dashboardService = new DashboardService();