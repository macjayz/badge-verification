import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { BadgeType, BadgeRules } from '../entities/BadgeType';
import { Issuer } from '../entities/Issuer';
import { BadgeMint } from '../entities/BadgeMint';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error occurred';
}

// Helper function to get mint status from BadgeMint
function getMintStatus(mint: BadgeMint): string {
  return mint.metadata?.status || 'unknown';
}

export class BadgeManagementController {
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  private issuerRepository = AppDataSource.getRepository(Issuer);
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);

  // 📋 Get all badge types with pagination and search
  getAllBadgeTypes = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search = '', issuerId = '', isActive = '' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      const queryBuilder = this.badgeTypeRepository
        .createQueryBuilder('badgeType')
        .leftJoinAndSelect('badgeType.issuer', 'issuer')
        .leftJoinAndSelect('badgeType.mints', 'mints')
        .orderBy('badgeType.createdAt', 'DESC');

      // Search filter
      if (search) {
        queryBuilder.where('badgeType.name ILIKE :search OR badgeType.key ILIKE :search OR badgeType.description ILIKE :search', {
          search: `%${search}%`
        });
      }

      // Issuer filter
      if (issuerId) {
        queryBuilder.andWhere('badgeType.issuerId = :issuerId', { issuerId });
      }

      // Active status filter
      if (isActive !== '') {
        const activeStatus = isActive === 'true';
        queryBuilder.andWhere('badgeType.isActive = :isActive', { isActive: activeStatus });
      }

      const [badgeTypes, total] = await queryBuilder
        .skip((pageNum - 1) * limitNum)
        .take(limitNum)
        .getManyAndCount();

      // Calculate stats for each badge type
      const badgeTypesWithStats = await Promise.all(
        badgeTypes.map(async (badgeType) => {
          const mints = badgeType.mints || [];
          const completedMints = mints.filter(m => getMintStatus(m) === 'completed').length;
          const failedMints = mints.filter(m => getMintStatus(m) === 'failed').length;
          const totalMints = mints.length;

          return {
            id: badgeType.id,
            key: badgeType.key,
            name: badgeType.name,
            description: badgeType.description,
            imageUrl: badgeType.imageUrl,
            issuer: {
              id: badgeType.issuer.id,
              name: badgeType.issuer.name
            },
            rules: badgeType.rules,
            isGlobal: badgeType.isGlobal,
            isActive: badgeType.isActive,
            contractBadgeTypeId: badgeType.contractBadgeTypeId,
            metadataIpfs: badgeType.metadataIpfs,
            totalMints,
            completedMints,
            failedMints,
            successRate: totalMints > 0 ? (completedMints / totalMints) * 100 : 0,
            createdAt: badgeType.createdAt,
            updatedAt: badgeType.updatedAt
          };
        })
      );

      res.json({
        success: true,
        data: {
          badgeTypes: badgeTypesWithStats,
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
      logger.error('Get all badge types error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge types',
        details: getErrorMessage(error)
      });
    }
  };

  // 🆕 Create new badge type
  createBadgeType = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { 
        key, 
        name, 
        description, 
        imageUrl, 
        issuerId, 
        rules, 
        isGlobal = false,
        contractBadgeTypeId,
        metadataIpfs 
      } = req.body;

      // Validate required fields
      if (!key || !name || !issuerId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: key, name, issuerId'
        });
      }

      // Validate rules structure
      if (!rules || !rules.primary || !Array.isArray(rules.primary)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid rules: must include primary array'
        });
      }

      // Check if badge key already exists
      const existingBadge = await this.badgeTypeRepository.findOne({
        where: { key }
      });

      if (existingBadge) {
        return res.status(400).json({
          success: false,
          error: 'Badge key already exists'
        });
      }

      // Get issuer
      const issuer = await this.issuerRepository.findOne({
        where: { id: issuerId }
      });

      if (!issuer) {
        return res.status(404).json({
          success: false,
          error: 'Issuer not found'
        });
      }

      // Create badge type with your entity structure
      const badgeType = this.badgeTypeRepository.create({
        key,
        name,
        description,
        imageUrl,
        issuer,
        rules,
        isGlobal,
        contractBadgeTypeId,
        metadataIpfs,
        isActive: true
      });

      await this.badgeTypeRepository.save(badgeType);

      logger.info(`New badge type created: ${name} (${key}) for issuer: ${issuer.name}`);

      res.status(201).json({
        success: true,
        data: badgeType,
        message: 'Badge type created successfully'
      });

    } catch (error) {
      logger.error('Create badge type error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create badge type',
        details: getErrorMessage(error)
      });
    }
  };

  // ✏️ Update badge type
  updateBadgeType = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { badgeTypeId } = req.params;
      const updates = req.body;

      const badgeType = await this.badgeTypeRepository.findOne({
        where: { id: badgeTypeId },
        relations: ['issuer', 'mints']
      });

      if (!badgeType) {
        return res.status(404).json({
          success: false,
          error: 'Badge type not found'
        });
      }

      // Don't allow updating the key if it's being used in mints
      if (updates.key && updates.key !== badgeType.key) {
        const existingMints = badgeType.mints?.length || 0;
        if (existingMints > 0) {
          return res.status(400).json({
            success: false,
            error: 'Cannot change badge key: badge has existing mints'
          });
        }
      }

      // Update fields
      Object.assign(badgeType, updates);
      await this.badgeTypeRepository.save(badgeType);

      logger.info(`Badge type updated: ${badgeType.name} (${badgeType.key})`);

      res.json({
        success: true,
        data: badgeType,
        message: 'Badge type updated successfully'
      });

    } catch (error) {
      logger.error('Update badge type error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update badge type',
        details: getErrorMessage(error)
      });
    }
  };

  // 📊 Get badge analytics
  getBadgeAnalytics = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { badgeTypeId } = req.params;

      const badgeType = await this.badgeTypeRepository.findOne({
        where: { id: badgeTypeId },
        relations: ['mints', 'issuer']
      });

      if (!badgeType) {
        return res.status(404).json({
          success: false,
          error: 'Badge type not found'
        });
      }

      const mints = badgeType.mints || [];
      const completedMints = mints.filter(m => getMintStatus(m) === 'completed');
      const failedMints = mints.filter(m => getMintStatus(m) === 'failed');
      const pendingMints = mints.filter(m => 
        getMintStatus(m) === 'pending' || getMintStatus(m) === 'unknown'
      );

      // Daily mint statistics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyStats = await this.badgeMintRepository
        .createQueryBuilder('mint')
        .select('DATE(mint.createdAt)', 'date')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(CASE WHEN mint.metadata ->> \'status\' = \'completed\' THEN 1 END)', 'completed')
        .addSelect('COUNT(CASE WHEN mint.metadata ->> \'status\' = \'failed\' THEN 1 END)', 'failed')
        .where('mint.badgeTypeId = :badgeTypeId', { badgeTypeId })
        .andWhere('mint.createdAt >= :date', { date: thirtyDaysAgo })
        .groupBy('DATE(mint.createdAt)')
        .orderBy('date', 'ASC')
        .getRawMany();

      const analytics = {
        badgeType: {
          id: badgeType.id,
          key: badgeType.key,
          name: badgeType.name,
          description: badgeType.description,
          imageUrl: badgeType.imageUrl,
          issuer: badgeType.issuer?.name,
          rules: badgeType.rules,
          isGlobal: badgeType.isGlobal,
          contractBadgeTypeId: badgeType.contractBadgeTypeId,
          metadataIpfs: badgeType.metadataIpfs
        },
        statistics: {
          totalMints: mints.length,
          completedMints: completedMints.length,
          failedMints: failedMints.length,
          pendingMints: pendingMints.length,
          successRate: mints.length > 0 ? (completedMints.length / mints.length) * 100 : 0
        },
        dailyStats: dailyStats.map(stat => ({
          date: stat.date,
          total: parseInt(stat.total),
          completed: parseInt(stat.completed),
          failed: parseInt(stat.failed)
        })),
        recentMints: completedMints
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map(mint => ({
            id: mint.id,
            wallet: mint.wallet,
            transactionHash: mint.transactionHash,
            status: getMintStatus(mint),
            createdAt: mint.createdAt
          }))
      };

      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get badge analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge analytics',
        details: getErrorMessage(error)
      });
    }
  };

  // ⚙️ Update eligibility rules
  updateEligibilityRules = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { badgeTypeId } = req.params;
      const { rules } = req.body;

      const badgeType = await this.badgeTypeRepository.findOne({
        where: { id: badgeTypeId }
      });

      if (!badgeType) {
        return res.status(404).json({
          success: false,
          error: 'Badge type not found'
        });
      }

      // Validate rules structure
      if (!rules || !rules.primary || !Array.isArray(rules.primary)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid rules: must include primary array'
        });
      }

      badgeType.rules = rules;
      await this.badgeTypeRepository.save(badgeType);

      logger.info(`Eligibility rules updated for badge: ${badgeType.name}`);

      res.json({
        success: true,
        data: badgeType,
        message: 'Eligibility rules updated successfully'
      });

    } catch (error) {
      logger.error('Update eligibility rules error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update eligibility rules',
        details: getErrorMessage(error)
      });
    }
  };

  // 🔄 Toggle badge active status
  toggleBadgeStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { badgeTypeId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'isActive must be a boolean'
        });
      }

      const badgeType = await this.badgeTypeRepository.findOne({
        where: { id: badgeTypeId }
      });

      if (!badgeType) {
        return res.status(404).json({
          success: false,
          error: 'Badge type not found'
        });
      }

      badgeType.isActive = isActive;
      await this.badgeTypeRepository.save(badgeType);

      const statusText = isActive ? 'activated' : 'deactivated';
      logger.info(`Badge ${statusText}: ${badgeType.name} (${badgeType.key})`);

      res.json({
        success: true,
        data: badgeType,
        message: `Badge ${statusText} successfully`
      });

    } catch (error) {
      logger.error('Toggle badge status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to toggle badge status',
        details: getErrorMessage(error)
      });
    }
  };
}

export const badgeManagementController = new BadgeManagementController();