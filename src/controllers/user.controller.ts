// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { mintingService } from '../services/minting.service';
import { eligibilityService } from '../services/eligibility.service';
import { achievementService } from '../services/achievement.service';
import { logger } from '../utils/logger';
import { Not, IsNull } from 'typeorm';

const userRepository = AppDataSource.getRepository(User);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const verificationRepository = AppDataSource.getRepository(Verification);

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
        console.error('Profile error:', error);
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
      console.error('User badges error:', error);
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
        // relations: ['verifications']
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
      console.error('Available badges error:', error);
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
          details: `Badge: ${mint.badgeType.name}`
        })),
        ...verifications.map(verification => ({
          type: 'verification',
          id: verification.id,
          provider: verification.provider,
          status: verification.status,
          date: verification.createdAt,
          details: `${verification.provider} verification ${verification.status}`
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
       .slice(0, limit);
      
      res.json(activity);
    } catch (error) {
      console.error('User activity error:', error);
      res.status(500).json({ error: 'Failed to fetch user activity' });
    }
  }

  // NEW: Mint badge endpoint for users
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

  // NEW: Check eligibility for specific badge
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


// BEST VERSION: Using the actual enums
static async completeVerification(req: Request, res: Response) {
    try {
        const userId = (req as AuthenticatedRequest).user?.userId;
        const { provider, did } = req.body;
        
        // Get user first to get wallet
        const user = await userRepository.findOne({
            where: { id: userId }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Determine verification type based on provider - USING ACTUAL ENUMS
        const getVerificationType = (provider: string): VerificationType => {
            const primaryProviders = ['polygonid', 'idos'];
            
            if (primaryProviders.includes(provider)) {
                return VerificationType.PRIMARY_DID;
            } else {
                return VerificationType.SECONDARY;
            }
        };

        const verificationType = getVerificationType(provider);

        // Check if verification already exists
        const existingVerification = await verificationRepository.findOne({
            where: { wallet: user.wallet, provider }
        });

        let verification;
        
        if (existingVerification) {
            // Update existing verification
            existingVerification.status = VerificationStatus.COMPLETED;
            existingVerification.did = did;
            existingVerification.type = verificationType;
            existingVerification.metadata = {
                ...existingVerification.metadata,
                completedAt: new Date().toISOString(),
                lastVerified: new Date().toISOString(),
                test: true
            };
            existingVerification.completedAt = new Date();
            verification = await verificationRepository.save(existingVerification);
        } else {
            // Create new verification with proper type
            verification = verificationRepository.create({
                wallet: user.wallet,
                provider,
                type: verificationType,
                status: VerificationStatus.COMPLETED,
                did,
                metadata: {
                    completedAt: new Date().toISOString(),
                    test: true,
                    method: 'simulated'
                },
                completedAt: new Date()
            });
            await verificationRepository.save(verification);
        }

        res.json({
            success: true,
            verification: {
                id: verification.id,
                provider: verification.provider,
                type: verification.type,
                status: verification.status,
                did: verification.did,
                completedAt: verification.completedAt
            },
            message: `Successfully completed ${provider} verification`
        });
    } catch (error) {
        console.error('Complete verification error:', error);
        res.status(500).json({ 
            error: 'Failed to complete verification',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

// Get user's verifications
static async getUserVerifications(req: Request, res: Response) {
    try {
        const userId = (req as AuthenticatedRequest).user?.userId;
        
        // Get user first to get wallet
        const user = await userRepository.findOne({
            where: { id: userId }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Query verifications separately using the user's wallet
        const verifications = await verificationRepository.find({
            where: { wallet: user.wallet },
            order: { createdAt: 'DESC' }
        });

        res.json(verifications || []);
    } catch (error) {
        console.error('Get user verifications error:', error);
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
            console.error('Get achievements error:', error);
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
            console.error('Initialize achievements error:', error);
            res.status(500).json({ error: 'Failed to initialize achievements' });
        }
    }
}

export default UserController;