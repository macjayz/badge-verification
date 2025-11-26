import { Request, Response } from 'express';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { Verification } from '../entities/Verification';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const userRepository = AppDataSource.getRepository(User);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const verificationRepository = AppDataSource.getRepository(Verification);

export class UserController {
  
  // Get user profile
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      
      const user = await userRepository.findOne({
        where: { id: userId },
        relations: ['verifications']
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        id: user.id,
        wallet: user.wallet,
        did: user.did,
        provider: user.provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        verifications: user.verifications,
        totalBadges: await badgeMintRepository.count({ 
          where: { wallet: user.wallet } 
        })
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
        relations: ['verifications']
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get all active badge types
      const availableBadges = await badgeTypeRepository.find({
        where: { isActive: true },
        relations: ['issuer']
      });
      
      // Get user's already minted badges
      const userMints = await badgeMintRepository.find({
        where: { wallet: user.wallet },
        select: ['badgeTypeId']
      });
      
      const mintedBadgeIds = new Set(userMints.map(mint => mint.badgeTypeId));
      
      // Check eligibility for each badge
      const badgesWithEligibility = await Promise.all(
        availableBadges.map(async (badge) => {
          const isAlreadyMinted = mintedBadgeIds.has(badge.id);
          
          if (isAlreadyMinted) {
            return null; // Skip already minted badges
          }
          
          let isEligible = false;
          let reasons: string[] = [];
          
          // Check primary DID requirements from badge rules
          if (badge.rules?.primary && badge.rules.primary.length > 0) {
            const hasPrimaryVerification = user.verifications?.some(verification => 
              verification.type === 'primary_did' && 
              verification.status === 'completed' &&
              badge.rules.primary.includes(verification.provider)
            );
            
            if (!hasPrimaryVerification) {
              reasons.push(`Missing required DID verification: ${badge.rules.primary.join(' or ')}`);
            } else {
              isEligible = true;
            }
          } else {
            // If no primary requirements, user is eligible by default
            isEligible = true;
          }
          
          // Check secondary rules if primary requirements are met
          if (isEligible && badge.rules?.secondary && badge.rules.secondary.length > 0) {
            const secondaryResults = await Promise.all(
              badge.rules.secondary.map(async (rule) => {
                // Simplified secondary rule checking
                const hasSecondaryVerification = user.verifications?.some(verification => 
                  verification.provider === rule.method && 
                  verification.status === 'completed'
                );
                
                if (rule.required && !hasSecondaryVerification) {
                  return `Missing required verification: ${rule.method}`;
                }
                return null;
              })
            );
            
            const failedSecondary = secondaryResults.filter(result => result !== null);
            if (failedSecondary.length > 0) {
              isEligible = false;
              reasons.push(...failedSecondary);
            }
          }
          
          return {
            id: badge.id,
            key: badge.key,
            name: badge.name,
            description: badge.description,
            imageUrl: badge.imageUrl,
            issuer: badge.issuer?.name,
            rules: badge.rules,
            isGlobal: badge.isGlobal,
            contractBadgeTypeId: badge.contractBadgeTypeId,
            isEligible,
            reasons: isEligible ? [] : reasons
          };
        })
      );
      
      // Filter out null values (already minted badges)
      const filteredBadges = badgesWithEligibility.filter(badge => badge !== null);
      
      res.json(filteredBadges);
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
          status: mint.isRevoked ? 'revoked' : 'minted',
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
}

// Export the class directly (no instance needed since we're using static methods)
export default UserController;