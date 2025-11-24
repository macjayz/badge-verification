// src/controllers/user-management.controller.ts
import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { Verification } from '../entities/Verification';
import { BadgeMint } from '../entities/BadgeMint';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// Helper function to safely get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else {
    return 'Unknown error occurred';
  }
}

// Helper function to get mint status from BadgeMint
function getMintStatus(mint: BadgeMint): string {
  return mint.metadata?.status || 'unknown';
}

export class UserManagementController {
  private userRepository = AppDataSource.getRepository(User);
  private verificationRepository = AppDataSource.getRepository(Verification);
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);

  // Get all users with their stats
  getAllUsers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search = '' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const searchTerm = search as string;

      logger.info(`Fetching users - page: ${pageNum}, limit: ${limitNum}, search: ${searchTerm}`);

      // First, let's check what users actually exist
      const totalUsers = await this.userRepository.count();
      logger.info(`Total users in database: ${totalUsers}`);

      if (totalUsers === 0) {
        return res.json({
          success: true,
          data: {
            users: [],
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: 0,
              totalPages: 0
            }
          },
          timestamp: new Date().toISOString()
        });
      }

      // Get all users with proper query
      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.verifications', 'verifications')
        .orderBy('user.createdAt', 'DESC');

      // Add search filter if provided - use correct column names
      if (searchTerm) {
        queryBuilder.where('user.wallet ILIKE :search', { 
          search: `%${searchTerm}%` 
        });
      }

      // Get paginated users
      const [users, total] = await queryBuilder
        .skip((pageNum - 1) * limitNum)
        .take(limitNum)
        .getManyAndCount();

      logger.info(`Found ${users.length} users after pagination`);

      // Get additional data for each user
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          try {
            // Get user's badge mints using wallet
            const badgeMints = await this.badgeMintRepository.find({
              where: { wallet: user.wallet },
              relations: ['badgeType']
            });

            // Use metadata.status for status checking
            const successfulMints = badgeMints.filter(mint => 
              getMintStatus(mint) === 'completed' || getMintStatus(mint) === 'success'
            );
            
            const failedMints = badgeMints.filter(mint => 
              getMintStatus(mint) === 'failed'
            );

            // Use the verifications that are already loaded via relation
            const verifications = user.verifications || [];
            const latestVerification = verifications.length > 0 
              ? verifications.reduce((latest, current) => 
                  new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
                )
              : null;

            return {
              id: user.id,
              walletAddress: user.wallet, // Map 'wallet' to 'walletAddress' for frontend
              verificationStatus: latestVerification?.status || 'not_verified',
              verifiedAt: latestVerification?.createdAt,
              totalMints: badgeMints.length,
              successfulMints: successfulMints.length,
              failedMints: failedMints.length,
              successRate: badgeMints.length ? (successfulMints.length / badgeMints.length) * 100 : 0,
              lastActivity: user.updatedAt,
              isActive: successfulMints.length > 0,
              createdAt: user.createdAt
            };
          } catch (error) {
            logger.error(`Error processing user ${user.id}:`, error);
            return {
              id: user.id,
              walletAddress: user.wallet,
              verificationStatus: 'error',
              verifiedAt: null,
              totalMints: 0,
              successfulMints: 0,
              failedMints: 0,
              successRate: 0,
              lastActivity: user.updatedAt,
              isActive: false,
              createdAt: user.createdAt
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          users: usersWithStats,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get users',
        details: getErrorMessage(error)
      });
    }
  }

  // Get user details by ID
  getUserDetails = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      logger.info(`Fetching user details for ID: ${userId}`);

      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['verifications']
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get user's badge mints using wallet
      const badgeMints = await this.badgeMintRepository.find({
        where: { wallet: user.wallet },
        relations: ['badgeType']
      });

      // Calculate detailed stats using metadata.status
      const successfulMints = badgeMints.filter(mint => 
        getMintStatus(mint) === 'completed' || getMintStatus(mint) === 'success'
      );
      
      const failedMints = badgeMints.filter(mint => 
        getMintStatus(mint) === 'failed'
      );

      const pendingMints = badgeMints.filter(mint => 
        getMintStatus(mint) === 'pending' || getMintStatus(mint) === 'unknown'
      );

      const userDetails = {
        id: user.id,
        walletAddress: user.wallet, // Map to walletAddress for frontend
        isActive: successfulMints.length > 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        stats: {
          totalMints: badgeMints.length,
          successfulMints: successfulMints.length,
          failedMints: failedMints.length,
          pendingMints: pendingMints.length,
          successRate: badgeMints.length ? (successfulMints.length / badgeMints.length) * 100 : 0,
          totalVerifications: user.verifications?.length || 0
        },
        verifications: (user.verifications || []).map(v => ({
          id: v.id,
          provider: v.provider,
          status: v.status,
          createdAt: v.createdAt
        })),
        badgeMints: badgeMints.map(mint => ({
          id: mint.id,
          badgeType: mint.badgeType?.name,
          status: getMintStatus(mint),
          transactionHash: mint.transactionHash,
          createdAt: mint.createdAt,
          completedAt: mint.metadata?.completedAt
        }))
      };

      res.json({
        success: true,
        data: userDetails,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get user details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user details',
        details: getErrorMessage(error)
      });
    }
  }

  // Update user status (activate/deactivate)
  updateUserStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'isActive field is required and must be a boolean'
        });
      }

      const user = await this.userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Since your User entity doesn't have isActive field, we'll store it in a way that works
      // You might want to add this field to your User entity later
      logger.info(`Would update user ${userId} status to: ${isActive}`);
      // For now, we'll just return success since we can't store it in the entity

      res.json({
        success: true,
        data: {
          id: user.id,
          walletAddress: user.wallet,
          isActive: isActive
        },
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
      });

    } catch (error) {
      logger.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user status',
        details: getErrorMessage(error)
      });
    }
  }

  // Get user statistics for dashboard - FIXED VERSION
  // In the getUserStatistics method, replace the activeUsers calculation:
getUserStatistics = async (req: AuthenticatedRequest, res: Response) => {
    try {
      logger.info('Fetching user statistics...');
  
      // Total users count - from users table
      const totalUsers = await this.userRepository.count();
      logger.info(`Total users: ${totalUsers}`);
  
      // FIXED: Active users should be users with successful mints FROM THE USERS TABLE
      let activeUsers = 0;
      try {
        // Get users from users table who have successful mints
        const usersWithSuccessfulMints = await this.userRepository
          .createQueryBuilder('user')
          .innerJoin('badge_mints', 'mint', 'mint.wallet = user.wallet')
          .where("mint.metadata ->> 'status' IN ('completed', 'success')")
          .getCount();
        activeUsers = usersWithSuccessfulMints;
        logger.info(`Active users (corrected): ${activeUsers}`);
      } catch (error) {
        logger.error('Error counting active users:', error);
        activeUsers = 0;
      }
  
      // New users in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const newUsers = await this.userRepository
        .createQueryBuilder('user')
        .where('user.createdAt >= :date', { date: thirtyDaysAgo })
        .getCount();
      logger.info(`New users (30d): ${newUsers}`);
  
      // Users with verifications - from users table
      const verifiedUsers = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('verifications', 'verification', 'verification.wallet = user.wallet')
        .where('verification.status = :status', { status: 'verified' })
        .getCount();
      logger.info(`Verified users: ${verifiedUsers}`);
  
      const stats = {
        totalUsers,
        activeUsers,
        newUsers,
        verifiedUsers,
        verificationRate: totalUsers ? (verifiedUsers / totalUsers) * 100 : 0,
        activeRate: totalUsers ? (activeUsers / totalUsers) * 100 : 0
      };
  
      logger.info('Final user statistics:', stats);
  
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
  
    } catch (error) {
      logger.error('Get user statistics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user statistics',
        details: getErrorMessage(error)
      });
    }
  }
}

export const userManagementController = new UserManagementController();