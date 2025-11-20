// src/services/minting.service.ts
import { AppDataSource } from '../db/datasource';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { Web3Service } from './web3.service';
import { eligibilityService } from './eligibility.service';
import { webSocketEventsService } from './websocket-events.service';
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
    let mint;
    try {
      // ✅ EMIT MINTING STARTED EVENT (early, before eligibility check)
      webSocketEventsService.sendMintingStarted(wallet, badgeTypeKey, 'pending');

      // Check eligibility first
      const canMint = await this.canMintBadge(wallet, badgeTypeKey);
      
      if (!canMint.canMint) {
        // ✅ EMIT ELIGIBILITY FAILED EVENT
        webSocketEventsService.sendMintingFailed(wallet, badgeTypeKey, 'eligibility_check', canMint.reason || 'Not eligible');
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

      // Create mint record
      mint = this.badgeMintRepository.create({
        wallet: wallet.toLowerCase(),
        badgeType: badgeType,
        metadata: {
          verificationId,
          initiatedAt: new Date().toISOString(),
          status: 'pending'
        }
      });

      await this.badgeMintRepository.save(mint);

      // ✅ EMIT MINTING STARTED EVENT with actual mintId
      webSocketEventsService.sendMintingStarted(wallet, badgeTypeKey, mint.id);

      // Call Web3 service to mint the badge
      let mintResult;
      try {
        // ✅ EMIT TRANSACTION STARTING EVENT
        webSocketEventsService.sendTransactionStarting(wallet, badgeTypeKey, mint.id);

        // Ensure badgeType.id is a number for the Web3 service
        const badgeTypeId = typeof badgeType.id === 'string' ? parseInt(badgeType.id) : badgeType.id;
        mintResult = await web3Service.mintBadge(wallet, badgeTypeId);
        
        // ✅ EMIT TRANSACTION SUBMITTED EVENT
        webSocketEventsService.sendTransactionSubmitted(wallet, badgeTypeKey, mint.id, mintResult.transactionHash);

      } catch (error: any) {
        // Update mint record with failure
        mint.metadata = {
          ...mint.metadata,
          status: 'failed',
          error: error.message,
          failedAt: new Date().toISOString()
        };
        await this.badgeMintRepository.save(mint);

        // ✅ EMIT MINTING FAILED EVENT
        webSocketEventsService.sendMintingFailed(wallet, badgeTypeKey, mint.id, error.message);

        throw new MintingError(
          `Blockchain minting failed: ${error.message}`,
          error.transactionHash,
          { wallet, badgeTypeKey, mintId: mint.id }
        );
      }

      // Update mint record with success
      mint.tokenId = mintResult.tokenId.toString();
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

      // ✅ EMIT MINTING COMPLETED EVENT
      webSocketEventsService.sendMintingCompleted(
        wallet, 
        badgeTypeKey, 
        mint.id, 
        mintResult.tokenId, 
        mintResult.transactionHash
      );

      return {
        success: true,
        mintId: mint.id,
        transactionHash: mintResult.transactionHash
      };

    } catch (error) {
      logger.error(`Error initiating mint for ${wallet}, badge ${badgeTypeKey}:`, error);
      
      // ✅ EMIT GENERIC ERROR EVENT if mint record was created
      if (mint) {
        webSocketEventsService.sendMintingFailed(
          wallet, 
          badgeTypeKey, 
          mint.id, 
          error instanceof Error ? error.message : 'Unknown error'
        );
      } else {
        // If no mint record was created, emit a generic error
        webSocketEventsService.sendMintingFailed(
          wallet,
          badgeTypeKey,
          'unknown',
          error instanceof Error ? error.message : 'Unknown error during mint initiation'
        );
      }

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

    // ✅ EMIT REVOCATION STARTED EVENT
    webSocketEventsService.sendMintStatusUpdate(mint.wallet, mintId, mint.badgeType?.key || 'unknown', 'revocation_started');

    mint.isRevoked = true;
    mint.metadata = {
      ...mint.metadata,
      revoked: true,
      revocationReason: reason,
      revokedAt: new Date().toISOString()
    };

    await this.badgeMintRepository.save(mint);

    // ✅ EMIT REVOCATION COMPLETED EVENT
    webSocketEventsService.sendBadgeRevoked(mint.wallet, mintId, reason);

    // TODO: Implement blockchain revocation when needed
    logger.info(`Badge revoked: ${mintId} for reason: ${reason}`);

    return true;
  }

  // Add method to emit status updates
  async emitMintStatusUpdate(mintId: string, status: string, details?: any): Promise<void> {
    const mint = await this.badgeMintRepository.findOne({
      where: { id: mintId },
      relations: ['badgeType']
    });

    if (mint) {
      webSocketEventsService.sendMintStatusUpdate(mint.wallet, mintId, mint.badgeType.key, status, details);
    }
  }

  // ✅ PRESERVED: Check eligibility endpoint wrapper
  async checkEligibility(wallet: string, badgeTypeKey: string): Promise<{
    eligible: boolean;
    missingRequirements: string[];
    canMintResult?: CanMintResult;
  }> {
    try {
      // Emit eligibility check started
      webSocketEventsService.sendEligibilityCheckStarted(wallet, badgeTypeKey);

      const canMintResult = await this.canMintBadge(wallet, badgeTypeKey);
      
      const result = {
        eligible: canMintResult.canMint,
        missingRequirements: canMintResult.canMint ? [] : [canMintResult.reason || 'Unknown eligibility issue'],
        canMintResult
      };

      // Emit eligibility check completed
      webSocketEventsService.sendEligibilityCheckCompleted(
        wallet, 
        badgeTypeKey, 
        result.eligible, 
        result.missingRequirements
      );

      return result;
    } catch (error) {
      logger.error(`Error checking eligibility for ${wallet}, badge ${badgeTypeKey}:`, error);
      
      // Emit eligibility check failed
      webSocketEventsService.sendEligibilityCheckCompleted(
        wallet, 
        badgeTypeKey, 
        false, 
        ['Error checking eligibility']
      );

      return {
        eligible: false,
        missingRequirements: ['Error checking eligibility']
      };
    }
  }

  // ✅ PRESERVED: Get badge types available for minting
  async getAvailableBadgeTypes(wallet: string): Promise<{
    available: BadgeType[];
    unavailable: { badgeType: BadgeType; reason: string }[];
  }> {
    const allBadgeTypes = await this.badgeTypeRepository.find({
      where: { isActive: true }
    });

    const available: BadgeType[] = [];
    const unavailable: { badgeType: BadgeType; reason: string }[] = [];

    for (const badgeType of allBadgeTypes) {
      const canMint = await this.canMintBadge(wallet, badgeType.key);
      
      if (canMint.canMint) {
        available.push(badgeType);
      } else {
        unavailable.push({
          badgeType,
          reason: canMint.reason || 'Not eligible'
        });
      }
    }

    return { available, unavailable };
  }

  // ✅ PRESERVED: Get minting statistics
  async getMintingStats(): Promise<{
    totalMints: number;
    successfulMints: number;
    failedMints: number;
    revokedMints: number;
    byBadgeType: Record<string, number>;
  }> {
    const allMints = await this.badgeMintRepository.find({
      relations: ['badgeType']
    });

    const stats = {
      totalMints: allMints.length,
      successfulMints: allMints.filter(m => !m.isRevoked && m.transactionHash).length,
      failedMints: allMints.filter(m => m.metadata?.status === 'failed').length,
      revokedMints: allMints.filter(m => m.isRevoked).length,
      byBadgeType: {} as Record<string, number>
    };

    // Count by badge type
    allMints.forEach(mint => {
      const badgeTypeKey = mint.badgeType.key;
      stats.byBadgeType[badgeTypeKey] = (stats.byBadgeType[badgeTypeKey] || 0) + 1;
    });

    return stats;
  }

  // ✅ PRESERVED: Batch eligibility check
  async batchCheckEligibility(wallet: string, badgeTypeKeys: string[]): Promise<{
    wallet: string;
    results: {
      badgeTypeKey: string;
      eligible: boolean;
      reason?: string;
      suggestion?: string;
    }[];
  }> {
    const results = await Promise.all(
      badgeTypeKeys.map(async (badgeTypeKey) => {
        const canMint = await this.canMintBadge(wallet, badgeTypeKey);
        return {
          badgeTypeKey,
          eligible: canMint.canMint,
          reason: canMint.reason,
          suggestion: canMint.suggestion
        };
      })
    );

    return {
      wallet,
      results
    };
  }

  // ✅ PRESERVED: Get mint history with pagination
  async getMintHistory(page: number = 1, limit: number = 10): Promise<{
    mints: BadgeMint[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    
    const [mints, total] = await this.badgeMintRepository.findAndCount({
      relations: ['badgeType'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit
    });

    return {
      mints,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ✅ PRESERVED: Search mints by various criteria
  async searchMints(criteria: {
    wallet?: string;
    badgeTypeKey?: string;
    status?: string;
    transactionHash?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<BadgeMint[]> {
    const query = this.badgeMintRepository.createQueryBuilder('mint')
      .leftJoinAndSelect('mint.badgeType', 'badgeType');

    if (criteria.wallet) {
      query.andWhere('mint.wallet = :wallet', { wallet: criteria.wallet.toLowerCase() });
    }

    if (criteria.badgeTypeKey) {
      query.andWhere('badgeType.key = :badgeTypeKey', { badgeTypeKey: criteria.badgeTypeKey });
    }

    if (criteria.status) {
      query.andWhere('mint.metadata->>\'status\' = :status', { status: criteria.status });
    }

    if (criteria.transactionHash) {
      query.andWhere('mint.transactionHash = :transactionHash', { transactionHash: criteria.transactionHash });
    }

    if (criteria.dateFrom) {
      query.andWhere('mint.createdAt >= :dateFrom', { dateFrom: criteria.dateFrom });
    }

    if (criteria.dateTo) {
      query.andWhere('mint.createdAt <= :dateTo', { dateTo: criteria.dateTo });
    }

    return await query.orderBy('mint.createdAt', 'DESC').getMany();
  }
}

export const mintingService = new MintingService();