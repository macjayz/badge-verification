import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { Verification } from '../entities/Verification';
import { ProjectSocialRules } from '../entities/ProjectSocialRules';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { mintingService } from '../services/minting.service';
import { eligibilityService } from '../services/eligibility.service';
import { achievementService } from '../services/achievement.service';
import { verificationService } from '../services/verification.service';
import { logger } from '../utils/logger';
import { Not, IsNull } from 'typeorm';

const userRepository = AppDataSource.getRepository(User);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const verificationRepository = AppDataSource.getRepository(Verification);
const projectSocialRulesRepository = AppDataSource.getRepository(ProjectSocialRules);

export class UserController {

  // Get user profile
  // In getProfile method - fix verifications references
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get user's verifications separately
      const verifications = await verificationRepository.find({
        where: { wallet: user.wallet }
      });

      // Get user's badge statistics
      const totalBadges = await badgeMintRepository.count({
        where: {
          wallet: user.wallet,
          isRevoked: false
        }
      });

      const successfulMints = await badgeMintRepository.count({
        where: {
          wallet: user.wallet,
          isRevoked: false,
          transactionHash: Not(IsNull())
        }
      });

      res.json({
        id: user.id,
        wallet: user.wallet,
        did: user.did,
        provider: user.provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        verifications: verifications, // Use the separately queried verifications
        totalBadges,
        successfulMints,
        verificationLevel: verifications ? Math.min(100, verifications.length * 25) : 0 // Fix this line
      });
    } catch (error) {
      logger.error('Profile error:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  }

  // Get user's badges
  static async getUserBadges(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      // First get user to get their wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const badges = await badgeMintRepository.find({
        where: { wallet: user.wallet },
        relations: ['badgeType', 'badgeType.issuer'],
        order: { createdAt: 'DESC' }
      });

      res.json(badges.map(mint => ({
        id: mint.id,
        badgeType: {
          id: mint.badgeType.id,
          key: mint.badgeType.key,
          name: mint.badgeType.name,
          description: mint.badgeType.description,
          imageUrl: mint.badgeType.imageUrl,
          issuer: mint.badgeType.issuer?.name,
          issuerId: mint.badgeType.issuer?.id,
          contractBadgeTypeId: mint.badgeType.contractBadgeTypeId
        },
        tokenId: mint.tokenId,
        transactionHash: mint.transactionHash,
        isRevoked: mint.isRevoked,
        revokeReason: mint.revokeReason,
        metadata: mint.metadata,
        createdAt: mint.createdAt,
        updatedAt: mint.updatedAt
      })));
    } catch (error) {
      logger.error('User badges error:', error);
      res.status(500).json({ error: 'Failed to fetch user badges' });
    }
  }

  // Get available badges for user
  static async getAvailableBadges(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      // Get user first to get wallet
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get all active badge types
      const allBadgeTypes = await badgeTypeRepository.find({
        where: { isActive: true },
        relations: ['issuer']
      });

      const badgesWithEligibility = [];

      // Check each badge type individually and handle errors gracefully
      for (const badgeType of allBadgeTypes) {
        try {
          // Use the minting service to check eligibility
          const canMintResult = await mintingService.canMintBadge(user.wallet, badgeType.key);

          // Only include badges that aren't already minted
          if (!canMintResult.existingMint) {
            badgesWithEligibility.push({
              id: badgeType.id,
              key: badgeType.key,
              name: badgeType.name,
              description: badgeType.description,
              imageUrl: badgeType.imageUrl,
              issuer: badgeType.issuer?.name,
              issuerId: badgeType.issuer?.id,
              rules: badgeType.rules,
              isGlobal: badgeType.isGlobal,
              contractBadgeTypeId: badgeType.contractBadgeTypeId,
              isEligible: canMintResult.canMint,
              reasons: canMintResult.canMint ? [] : [canMintResult.reason || 'Not eligible']
            });
          }
        } catch (error) {
          logger.error(`Error checking eligibility for badge ${badgeType.key}:`, error);
          // Include the badge but mark as ineligible with error reason
          badgesWithEligibility.push({
            id: badgeType.id,
            key: badgeType.key,
            name: badgeType.name,
            description: badgeType.description,
            imageUrl: badgeType.imageUrl,
            issuer: badgeType.issuer?.name,
            issuerId: badgeType.issuer?.id,
            rules: badgeType.rules,
            isGlobal: badgeType.isGlobal,
            contractBadgeTypeId: badgeType.contractBadgeTypeId,
            isEligible: false,
            reasons: ['Temporarily unable to check eligibility']
          });
        }
      }

      res.json(badgesWithEligibility);
    } catch (error) {
      logger.error('Available badges error:', error);
      res.status(500).json({ error: 'Failed to fetch available badges' });
    }
  }

  // Get user activity
  static async getUserActivity(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      const limit = parseInt(req.query.limit as string) || 10;

      // Get user first to get wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const mints = await badgeMintRepository.find({
        where: { wallet: user.wallet },
        relations: ['badgeType'],
        order: { createdAt: 'DESC' },
        take: limit
      });

      const verifications = await verificationRepository.find({
        where: { wallet: user.wallet },
        order: { createdAt: 'DESC' },
        take: limit
      });

      // Combine mints and verifications into a single activity feed
      const activity = [
        ...mints.map(mint => ({
          type: 'badge_mint',
          id: mint.id,
          badgeName: mint.badgeType.name,
          status: mint.isRevoked ? 'revoked' : (mint.metadata?.status || 'minted'),
          date: mint.createdAt,
          transactionHash: mint.transactionHash,
          details: `Badge: ${mint.badgeType.name}`,
          issuer: mint.badgeType.issuer?.name
        })),
        ...verifications.map(verification => ({
          type: 'verification',
          id: verification.id,
          provider: verification.provider,
          status: verification.status,
          date: verification.createdAt,
          details: `${verification.provider} verification ${verification.status}`,
          issuerId: verification.metadata?.issuerId
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
       .slice(0, limit);

      res.json(activity);
    } catch (error) {
      logger.error('User activity error:', error);
      res.status(500).json({ error: 'Failed to fetch user activity' });
    }
  }

  // Mint badge endpoint for users
  static async mintBadge(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      const { badgeTypeId } = req.body;

      if (!badgeTypeId) {
        return res.status(400).json({ error: 'Badge type ID is required' });
      }

      // Get user first to get wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get badge type to get the key
      const badgeType = await badgeTypeRepository.findOne({
        where: { id: badgeTypeId }
      });

      if (!badgeType) {
        return res.status(404).json({ error: 'Badge type not found' });
      }

      logger.info(`User ${user.wallet} initiating mint for badge ${badgeType.key}`);

      // Use the minting service to initiate the mint
      const mintResult = await mintingService.initiateMint(user.wallet, badgeType.key);

      if (mintResult.success) {
        res.json({
          success: true,
          mintId: mintResult.mintId,
          transactionHash: mintResult.transactionHash,
          message: 'Badge minting initiated successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: mintResult.error
        });
      }
    } catch (error) {
      logger.error('Mint badge error:', error);
      res.status(500).json({ error: 'Failed to mint badge: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  }

  // Check eligibility for specific badge
  static async checkEligibility(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      const { badgeTypeId } = req.body;

      if (!badgeTypeId) {
        return res.status(400).json({ error: 'Badge type ID is required' });
      }

      // Get user first to get wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get badge type to get the key
      const badgeType = await badgeTypeRepository.findOne({
        where: { id: badgeTypeId }
      });

      if (!badgeType) {
        return res.status(404).json({ error: 'Badge type not found' });
      }

      // Use the minting service to check eligibility
      const eligibilityResult = await mintingService.checkEligibility(user.wallet, badgeType.key);

      res.json({
        isEligible: eligibilityResult.eligible,
        reasons: eligibilityResult.missingRequirements,
        badgeName: badgeType.name,
        canMintResult: eligibilityResult.canMintResult
      });
    } catch (error) {
      logger.error('Check eligibility error:', error);
      res.status(500).json({ error: 'Failed to check eligibility: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  }

  static async getUserVerifications(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      const { issuerId } = req.query;

      // Get user first to get wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let verifications;

      // Filter by issuerId if provided
      if (issuerId) {
        verifications = await verificationService.getUserVerificationsForIssuer(
          user.wallet,
          issuerId as string
        );
      } else {
        // Get all verifications
        verifications = await verificationRepository.find({
          where: { wallet: user.wallet },
          order: { createdAt: 'DESC' }
        });
      }

      res.json(verifications || []);
    } catch (error) {
      logger.error('Get user verifications error:', error);
      res.status(500).json({ error: 'Failed to fetch verifications' });
    }
  }

  static async getAchievements(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const achievements = await achievementService.getUserAchievements(userId);
      const stats = await achievementService.getAchievementStats(userId);

      res.json({
        success: true,
        achievements,
        stats
      });
    } catch (error) {
      logger.error('Get achievements error:', error);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  }

  static async initializeAchievements(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const achievements = await achievementService.initializeUserAchievements(userId);

      res.json({
        success: true,
        message: 'Achievements initialized successfully',
        achievements: achievements.length
      });
    } catch (error) {
      logger.error('Initialize achievements error:', error);
      res.status(500).json({ error: 'Failed to initialize achievements' });
    }
  }

  // Issuer-Specific Endpoints

  /**
   * Get issuer's verification requirements
   */
  static async getIssuerVerificationRequirements(req: Request, res: Response) {
    try {
      const { issuerId } = req.params;
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!issuerId) {
        return res.status(400).json({
          success: false,
          error: 'Issuer ID is required'
        });
      }

      // Get user wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get issuer's social rules from ProjectSocialRules
      const issuerRules = await projectSocialRulesRepository.find({
        where: {
          issuerId,
          isActive: true
        },
        order: { priority: 'DESC', createdAt: 'DESC' }
      });

      // Get user's existing verifications for this issuer
      const userVerifications = await verificationService.getUserVerificationsForIssuer(
        user.wallet,
        issuerId
      );

      // Map rules to requirements with user status
      const requirements = issuerRules.map(rule => {
        const existing = userVerifications.find(v => v.provider === rule.ruleType);

        return {
          ruleId: rule.id,
          type: rule.ruleType,
          name: rule.name,
          description: rule.description,
          parameters: rule.parameters,
          isRequired: rule.isRequired,
          isActive: rule.isActive,
          priority: rule.priority,
          status: existing?.status || 'not_started',
          verifiedAt: existing?.completedAt,
          details: existing?.metadata,
          actionRequired: UserController.getActionRequiredText(rule.ruleType, rule.parameters)
        };
      });

      // Get issuer info
      const issuer = await badgeTypeRepository
        .createQueryBuilder('badgeType')
        .leftJoinAndSelect('badgeType.issuer', 'issuer')
        .where('issuer.id = :issuerId', { issuerId })
        .getOne();

      res.json({
        success: true,
        data: {
          issuerId,
          issuerName: issuer?.issuer?.name || 'Unknown Issuer',
          issuerDescription: issuer?.issuer?.description || '',
          requirements,
          summary: {
            total: requirements.length,
            required: requirements.filter(r => r.isRequired).length,
            completed: requirements.filter(r => r.status === 'completed').length,
            pending: requirements.filter(r => r.status === 'pending').length,
            progress: requirements.length > 0 ?
              Math.round((requirements.filter(r => r.status === 'completed').length / requirements.length) * 100) : 0
          }
        }
      });

    } catch (error) {
      logger.error('Get issuer verification requirements error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get issuer verification requirements'
      });
    }
  }

  /**
   * Check eligibility for a specific issuer's badges
   */
  static async checkIssuerEligibility(req: Request, res: Response) {
    try {
      const { issuerId } = req.params;
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!issuerId) {
        return res.status(400).json({
          success: false,
          error: 'Issuer ID is required'
        });
      }

      // Get user wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get all badges from this issuer
      const issuerBadges = await badgeTypeRepository.find({
        where: {
          issuer: { id: issuerId },
          isActive: true
        },
        relations: ['issuer']
      });

      const eligibilityResults = [];

      // Check eligibility for each badge
      for (const badge of issuerBadges) {
        try {
          const result = await eligibilityService.checkEligibility(user.wallet, badge.key);
          eligibilityResults.push({
            badgeId: badge.id,
            badgeKey: badge.key,
            badgeName: badge.name,
            isEligible: result.eligible,
            reasons: result.reasons,
            missingRequirements: result.missingRequirements,
            issuerName: badge.issuer?.name
          });
        } catch (error) {
          logger.error(`Error checking eligibility for badge ${badge.key}:`, error);
          eligibilityResults.push({
            badgeId: badge.id,
            badgeKey: badge.key,
            badgeName: badge.name,
            isEligible: false,
            reasons: ['Error checking eligibility'],
            missingRequirements: ['System error'],
            issuerName: badge.issuer?.name
          });
        }
      }

      // Get issuer info
      const issuer = issuerBadges.length > 0 ? issuerBadges[0].issuer : null;

      res.json({
        success: true,
        data: {
          issuerId,
          issuerName: issuer?.name || 'Unknown Issuer',
          totalBadges: issuerBadges.length,
          eligibleBadges: eligibilityResults.filter(r => r.isEligible).length,
          eligibilityResults,
          summary: {
            total: eligibilityResults.length,
            eligible: eligibilityResults.filter(r => r.isEligible).length,
            ineligible: eligibilityResults.filter(r => !r.isEligible).length,
            successRate: eligibilityResults.length > 0 ?
              (eligibilityResults.filter(r => r.isEligible).length / eligibilityResults.length) * 100 : 0
          }
        }
      });

    } catch (error) {
      logger.error('Check issuer eligibility error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check issuer eligibility'
      });
    }
  }

  /**
   * Get user's verification status for a specific issuer
   */
  static async getIssuerVerificationStatus(req: Request, res: Response) {
    try {
      const { issuerId } = req.params;
      const userId = (req as AuthenticatedRequest).user?.userId;

      if (!issuerId) {
        return res.status(400).json({
          success: false,
          error: 'Issuer ID is required'
        });
      }

      // Get user wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get issuer's social rules
      const issuerRules = await projectSocialRulesRepository.find({
        where: {
          issuerId,
          isActive: true
        }
      });

      // Get user's verifications for this issuer
      const userVerifications = await verificationService.getUserVerificationsForIssuer(
        user.wallet,
        issuerId
      );

      // Calculate status for each rule
      const ruleStatuses = issuerRules.map(rule => {
        const existing = userVerifications.find(v => v.provider === rule.ruleType);

        return {
          ruleId: rule.id,
          ruleType: rule.ruleType,
          ruleName: rule.name,
          isRequired: rule.isRequired,
          status: existing?.status || 'not_started',
          verifiedAt: existing?.completedAt,
          parameters: rule.parameters
        };
      });

      // Overall status
      const requiredRules = ruleStatuses.filter(r => r.isRequired);
      const completedRequired = requiredRules.filter(r => r.status === 'completed').length;
      const allRequiredComplete = requiredRules.length === 0 ||
                                 completedRequired === requiredRules.length;

      // Get issuer info
      const issuer = await badgeTypeRepository
        .createQueryBuilder('badgeType')
        .leftJoinAndSelect('badgeType.issuer', 'issuer')
        .where('issuer.id = :issuerId', { issuerId })
        .getOne();

      res.json({
        success: true,
        data: {
          issuerId,
          issuerName: issuer?.issuer?.name || 'Unknown Issuer',
          wallet: user.wallet,
          ruleStatuses,
          summary: {
            totalRules: ruleStatuses.length,
            requiredRules: requiredRules.length,
            completedRequired,
            allRequiredComplete,
            progressPercentage: requiredRules.length > 0 ?
              Math.round((completedRequired / requiredRules.length) * 100) : 100
          },
          nextSteps: allRequiredComplete ?
            'All requirements met! You can now mint badges from this issuer.' :
            `Complete ${requiredRules.length - completedRequired} more required verification(s).`
        }
      });

    } catch (error) {
      logger.error('Get issuer verification status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get issuer verification status'
      });
    }
  }

  /**
   * Get all issuers that user has verified for or can verify for
   */
  static async getUserIssuers(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;

      // Get user wallet
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get all issuers from badge types
      const allIssuers = await badgeTypeRepository
        .createQueryBuilder('badgeType')
        .leftJoinAndSelect('badgeType.issuer', 'issuer')
        .where('badgeType.isActive = true')
        .andWhere('issuer.isActive = true')
        .select(['issuer.id', 'issuer.name', 'issuer.description', 'issuer.website'])
        .distinct(true)
        .getRawMany();

      // Get user's verifications with issuer context
      const userVerifications = await verificationRepository.find({
        where: { wallet: user.wallet }
      });

      // Group verifications by issuer
      const issuerVerifications: Record<string, any> = {};
      userVerifications.forEach(verification => {
        const issuerId = verification.metadata?.issuerId;
        if (issuerId) {
          if (!issuerVerifications[issuerId]) {
            issuerVerifications[issuerId] = {
              completed: 0,
              total: 0,
              verifications: []
            };
          }
          issuerVerifications[issuerId].completed +=
            verification.status === 'completed' ? 1 : 0;
          issuerVerifications[issuerId].total++;
          issuerVerifications[issuerId].verifications.push({
            provider: verification.provider,
            status: verification.status,
            completedAt: verification.completedAt
          });
        }
      });

      // Build response
      const issuers = allIssuers.map(issuer => {
        const issuerId = issuer.issuer_id;
        const verifications = issuerVerifications[issuerId];

        return {
          id: issuerId,
          name: issuer.issuer_name,
          description: issuer.issuer_description,
          website: issuer.issuer_website,
          hasVerifications: !!verifications,
          verificationStats: verifications ? {
            completed: verifications.completed,
            total: verifications.total,
            progress: verifications.total > 0 ?
              Math.round((verifications.completed / verifications.total) * 100) : 0
          } : null,
          badgesCount: 0 // Would need to count badges per issuer
        };
      });

      res.json({
        success: true,
        data: {
          wallet: user.wallet,
          totalIssuers: issuers.length,
          issuersWithVerifications: Object.keys(issuerVerifications).length,
          issuers
        }
      });

    } catch (error) {
      logger.error('Get user issuers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user issuers'
      });
    }
  }

  /**
   * Helper: Get action required text based on rule type
   */
  private static getActionRequiredText(ruleType: string, parameters: any): string {
    switch (ruleType) {
      case 'twitter_follow':
        return `Follow @${parameters.account || 'the issuer'} on Twitter`;
      case 'discord_member':
        return `Join ${parameters.serverName || 'the issuer\'s'} Discord server`;
      case 'snapshot_votes':
        return `Vote ${parameters.minVotes ? `at least ${parameters.minVotes} time(s) ` : ''}in ${parameters.space || 'the issuer\'s'} Snapshot space`;
      case 'onchain_activity':
        return `Complete ${parameters.minTransactions || 'required'} on-chain transactions`;
      default:
        return 'Complete verification requirement';
    }
  }
}

export default UserController;