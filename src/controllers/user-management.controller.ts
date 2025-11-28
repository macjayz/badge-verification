// FIXED: src/controllers/user-management.controller.ts
import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { BadgeMint } from '../entities/BadgeMint';
import { Verification } from '../entities/Verification';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const userRepository = AppDataSource.getRepository(User);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);
const verificationRepository = AppDataSource.getRepository(Verification);

export class UserManagementController {
  
  static async getUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const status = req.query.status as string;

      const skip = (page - 1) * limit;

      // Build query
      let query = userRepository.createQueryBuilder('user');

      // Apply search filter
      if (search) {
        query = query.where('user.wallet LIKE :search', { search: `%${search}%` });
      }

      // Apply status filter
      if (status === 'active') {
        // Users with successful mints are considered active
        query = query.innerJoin(BadgeMint, 'mint', 'mint.wallet = user.wallet')
                   .where("mint.metadata ->> 'status' = 'completed'");
      } else if (status === 'inactive') {
        // Users without any successful mints
        query = query.leftJoin(BadgeMint, 'mint', 'mint.wallet = user.wallet AND mint.metadata ->> \'status\' = \'completed\'')
                   .where('mint.id IS NULL');
      }

      // Get users with pagination
      const [users, total] = await query
        .orderBy('user.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Get additional data for each user
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          // Get user's verifications separately
          const verifications = await verificationRepository.find({
            where: { wallet: user.wallet }
          });

          // Get user's mint counts
          const mintCounts = await badgeMintRepository
            .createQueryBuilder('mint')
            .select('mint.wallet', 'wallet')
            .addSelect('COUNT(*)', 'totalMints')
            .addSelect(`COUNT(CASE WHEN mint.metadata ->> 'status' = 'completed' THEN 1 END)`, 'successMints')
            .where('mint.wallet = :wallet', { wallet: user.wallet })
            .groupBy('mint.wallet')
            .getRawOne();

          const latestVerification = verifications.length > 0 
            ? verifications.reduce((latest: Verification, current: Verification) => 
                new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
              )
            : null;

          return {
            id: user.id,
            walletAddress: user.wallet,
            verificationStatus: latestVerification?.status || 'not_verified',
            verifiedAt: latestVerification?.createdAt,
            badgesCount: mintCounts ? parseInt(mintCounts.successMints) : 0,
            totalMints: mintCounts ? parseInt(mintCounts.totalMints) : 0,
            lastActivity: user.updatedAt || user.createdAt,
            isActive: mintCounts ? parseInt(mintCounts.successMints) > 0 : false,
            createdAt: user.createdAt
          };
        })
      );

      res.json({
        users: usersWithStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  static async getUserStats(req: Request, res: Response) {
    try {
      const totalUsers = await userRepository.count();
      
      // Active users (with successful mints)
      const activeUsers = await userRepository
        .createQueryBuilder('user')
        .innerJoin(BadgeMint, 'mint', 'mint.wallet = user.wallet')
        .where("mint.metadata ->> 'status' = 'completed'")
        .getCount();

      // New users in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const newUsers = await userRepository
        .createQueryBuilder('user')
        .where('user.createdAt >= :date', { date: thirtyDaysAgo })
        .getCount();

      // Verified users (with completed verifications)
      const verifiedUsers = await verificationRepository
        .createQueryBuilder('verification')
        .select('DISTINCT verification.wallet')
        .where('verification.status = :status', { status: 'completed' })
        .getCount();

      res.json({
        totalUsers,
        activeUsers,
        newUsers,
        verifiedUsers,
        statsDate: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get user stats error:', error);
      res.status(500).json({ error: 'Failed to fetch user statistics' });
    }
  }

  static async getUserDetails(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get user's verifications
      const verifications = await verificationRepository.find({
        where: { wallet: user.wallet },
        order: { createdAt: 'DESC' }
      });

      // Get user's badges
      const badges = await badgeMintRepository.find({
        where: { wallet: user.wallet },
        relations: ['badgeType'],
        order: { createdAt: 'DESC' }
      });

      // Get mint statistics
      const mintStats = await badgeMintRepository
        .createQueryBuilder('mint')
        .select('COUNT(*)', 'totalMints')
        .addSelect(`COUNT(CASE WHEN mint.metadata ->> 'status' = 'completed' THEN 1 END)`, 'successfulMints')
        .addSelect(`COUNT(CASE WHEN mint.metadata ->> 'status' = 'failed' THEN 1 END)`, 'failedMints')
        .where('mint.wallet = :wallet', { wallet: user.wallet })
        .getRawOne();

      res.json({
        user: {
          id: user.id,
          wallet: user.wallet,
          did: user.did,
          provider: user.provider,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        verifications: verifications.map(v => ({
          id: v.id,
          provider: v.provider,
          status: v.status,
          createdAt: v.createdAt,
          completedAt: v.completedAt
        })),
        badges: badges.map(badge => ({
          id: badge.id,
          badgeType: badge.badgeType?.name,
          status: badge.metadata?.status,
          transactionHash: badge.transactionHash,
          createdAt: badge.createdAt
        })),
        statistics: {
          totalMints: parseInt(mintStats?.totalMints) || 0,
          successfulMints: parseInt(mintStats?.successfulMints) || 0,
          failedMints: parseInt(mintStats?.failedMints) || 0,
          successRate: mintStats?.totalMints > 0 
            ? (parseInt(mintStats.successfulMints) / parseInt(mintStats.totalMints)) * 100 
            : 0,
          totalVerifications: verifications.length,
          completedVerifications: verifications.filter(v => v.status === 'completed').length
        }
      });

    } catch (error) {
      logger.error('Get user details error:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  }

  static async updateUserStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      // In a real system, you might have an isActive field on User
      // For now, we'll just return success since we don't have that field
      res.json({
        success: true,
        message: 'User status would be updated in a real implementation',
        userId,
        status
      });

    } catch (error) {
      logger.error('Update user status error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
}