// src/services/minting.service.ts
import { AppDataSource } from '../db/datasource';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { Web3Service } from './web3.service';
import { eligibilityService } from './eligibility.service';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  NotFoundError,
  MintingError 
} from '../utils/errors';

// Create Web3Service instance
const web3Service = new Web3Service();

// Update the interface to include suggestion
interface CanMintResult {
  canMint: boolean;
  reason?: string;
  existingMint?: BadgeMint;
  suggestion?: string;
}

export class MintingService {
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);

  async canMintBadge(wallet: string, badgeTypeKey: string): Promise<CanMintResult> {
    try {
      // Validate inputs
      if (!wallet || !badgeTypeKey) {
        return {
          canMint: false,
          reason: 'Wallet and badge type key are required',
          suggestion: 'Provide both wallet address and badge type key'
        };
      }

      // Check if badge type exists and is active
      const badgeType = await this.badgeTypeRepository.findOne({
        where: { key: badgeTypeKey, isActive: true }
      });

      if (!badgeType) {
        return {
          canMint: false,
          reason: `Badge type '${badgeTypeKey}' not found or inactive`,
          suggestion: 'Check the badge type key or contact the issuer'
        };
      }

      // Check if user already has this badge
      const existingMint = await this.badgeMintRepository.findOne({
        where: { 
          wallet: wallet.toLowerCase(),
          badgeType: { key: badgeTypeKey },
          isRevoked: false
        },
        relations: ['badgeType']
      });

      if (existingMint) {
        return {
          canMint: false,
          reason: `Already have badge '${badgeTypeKey}'`,
          existingMint,
          suggestion: 'Each wallet can only mint this badge once'
        };
      }

      // Check eligibility
      const eligibility = await eligibilityService.checkEligibility(wallet, badgeTypeKey);
      
      if (!eligibility.eligible) {
        const missingRequirements = eligibility.missingRequirements.join(', ');
        return {
          canMint: false,
          reason: `Not eligible for badge: ${missingRequirements}`,
          suggestion: 'Complete the missing requirements and try again'
        };
      }

      return {
        canMint: true,
        reason: 'Eligible to mint badge'
      };

    } catch (error) {
      logger.error(`Error checking mint eligibility for ${wallet}, badge ${badgeTypeKey}:`, error);
      return {
        canMint: false,
        reason: 'Error checking eligibility',
        suggestion: 'Try again later or contact support'
      };
    }
  }

  async initiateMint(wallet: string, badgeTypeKey: string, verificationId?: string): Promise<{
    success: boolean;
    mintId?: string;
    error?: string;
    transactionHash?: string;
  }> {
    try {
      // Check eligibility first
      const canMint = await this.canMintBadge(wallet, badgeTypeKey);
      
      if (!canMint.canMint) {
        return {
          success: false,
          error: canMint.reason
        };
      }

      // Get badge type
      const badgeType = await this.badgeTypeRepository.findOne({
        where: { key: badgeTypeKey }
      });

      if (!badgeType) {
        throw new NotFoundError('Badge type', badgeTypeKey);
      }

      // Create mint record - use proper entity structure
      const mint = this.badgeMintRepository.create({
        wallet: wallet.toLowerCase(),
        badgeType: badgeType,
        metadata: {
          verificationId,
          initiatedAt: new Date().toISOString(),
          status: 'pending'
        }
      });

      await this.badgeMintRepository.save(mint);

      // Call Web3 service to mint the badge - convert badgeType.id to number if needed
      let mintResult;
      try {
        // Ensure badgeType.id is a number for the Web3 service
        const badgeTypeId = typeof badgeType.id === 'string' ? parseInt(badgeType.id) : badgeType.id;
        mintResult = await web3Service.mintBadge(wallet, badgeTypeId);
      } catch (error: any) {
        // Update mint record with failure in metadata
        mint.metadata = {
          ...mint.metadata,
          status: 'failed',
          error: error.message,
          failedAt: new Date().toISOString()
        };
        await this.badgeMintRepository.save(mint);

        throw new MintingError(
          `Blockchain minting failed: ${error.message}`,
          error.transactionHash,
          { wallet, badgeTypeKey, mintId: mint.id }
        );
      }

      // Update mint record with success in metadata
      // Convert tokenId to string if needed (based on entity type)
      mint.tokenId = mintResult.tokenId.toString(); // FIX: Convert number to string
      mint.transactionHash = mintResult.transactionHash;
      mint.metadata = {
        ...mint.metadata,
        status: 'completed',
        tokenId: mintResult.tokenId,
        transactionHash: mintResult.transactionHash,
        blockNumber: mintResult.blockNumber,
        completedAt: new Date().toISOString()
      };

      await this.badgeMintRepository.save(mint);

      return {
        success: true,
        mintId: mint.id,
        transactionHash: mintResult.transactionHash
      };

    } catch (error) {
      logger.error(`Error initiating mint for ${wallet}, badge ${badgeTypeKey}:`, error);
      
      if (error instanceof MintingError || error instanceof NotFoundError) {
        throw error;
      }
      
      return {
        success: false,
        error: `Failed to initiate mint: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getMintStatus(mintId: string): Promise<BadgeMint | null> {
    if (!mintId) {
      throw new ValidationError('Mint ID is required', {
        field: 'mintId',
        required: true
      });
    }

    const mint = await this.badgeMintRepository.findOne({
      where: { id: mintId },
      relations: ['badgeType']
    });

    return mint;
  }

  async getUserMints(wallet: string): Promise<BadgeMint[]> {
    if (!wallet) {
      throw new ValidationError('Wallet address is required', {
        field: 'wallet',
        required: true
      });
    }

    return await this.badgeMintRepository.find({
      where: { wallet: wallet.toLowerCase() },
      relations: ['badgeType'],
      order: { createdAt: 'DESC' }
    });
  }

  async getActiveUserBadges(wallet: string): Promise<BadgeMint[]> {
    if (!wallet) {
      throw new ValidationError('Wallet address is required', {
        field: 'wallet',
        required: true
      });
    }

    return await this.badgeMintRepository.find({
      where: { 
        wallet: wallet.toLowerCase(),
        isRevoked: false
      },
      relations: ['badgeType'],
      order: { createdAt: 'DESC' }
    });
  }

  async revokeBadge(mintId: string, reason: string): Promise<boolean> {
    if (!mintId || !reason) {
      throw new ValidationError('Mint ID and reason are required', {
        fields: { mintId: !mintId, reason: !reason }
      });
    }

    const mint = await this.badgeMintRepository.findOne({
      where: { id: mintId }
    });

    if (!mint) {
      throw new NotFoundError('Mint record', mintId);
    }

    if (mint.isRevoked) {
      throw new ValidationError('Badge is already revoked', {
        mintId,
        revokedAt: mint.updatedAt
      });
    }

    mint.isRevoked = true;
    mint.metadata = {
      ...mint.metadata,
      revoked: true,
      revocationReason: reason,
      revokedAt: new Date().toISOString()
    };

    await this.badgeMintRepository.save(mint);

    // TODO: Implement blockchain revocation when needed
    logger.info(`Badge revoked: ${mintId} for reason: ${reason}`);

    return true;
  }
}

export const mintingService = new MintingService();