import { AppDataSource } from '../db/datasource';
import { BadgeMint } from '../entities/BadgeMint';
import { BadgeType } from '../entities/BadgeType';
import { User } from '../entities/User';
import { Verification } from '../entities/Verification';
import { logger } from '../utils/logger';
import { Web3Service } from './web3.service';
import { EligibilityService } from './eligibility.service';

export enum MintStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed'
}

export class MintingService {
  private badgeMintRepository = AppDataSource.getRepository(BadgeMint);
  private badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  private userRepository = AppDataSource.getRepository(User);
  private verificationRepository = AppDataSource.getRepository(Verification);

  constructor(
    private web3Service: Web3Service,
    private eligibilityService: EligibilityService
  ) {}

  async initiateMint(
    wallet: string, 
    badgeTypeKey: string, 
    verificationId?: string
  ): Promise<{ success: boolean; mintId?: string; error?: string }> {
    try {
      // Check eligibility
      const eligibility = await this.eligibilityService.checkEligibility(wallet, badgeTypeKey);
      
      if (!eligibility.eligible) {
        return {
          success: false,
          error: `Not eligible for badge: ${eligibility.reasons.join(', ') || 'Requirements not met'}`
        };
      }

      // Get badge type
      const badgeType = await this.badgeTypeRepository.findOne({ 
        where: { key: badgeTypeKey } 
      });

      if (!badgeType) {
        return {
          success: false,
          error: 'Badge type not found'
        };
      }

      // Check if already minted and not revoked
      const existingMint = await this.badgeMintRepository.findOne({
        where: {
          wallet,
          badgeTypeId: badgeType.id,
          isRevoked: false
        }
      });

      if (existingMint) {
        return {
          success: false,
          error: 'Active badge already exists for this wallet'
        };
      }

      // Get verification if provided
      let verification: Verification | null = null;
      if (verificationId) {
        verification = await this.verificationRepository.findOne({
          where: { id: verificationId }
        });
      }

      // Create mint record
      const badgeMint = this.badgeMintRepository.create({
        wallet,
        badgeTypeId: badgeType.id,
        verificationId: verification?.id,
        metadata: {
          eligibilityCheck: eligibility,
          verificationUsed: verificationId,
          initiatedAt: new Date().toISOString(),
          badgeTypeKey
        }
      });

      await this.badgeMintRepository.save(badgeMint);

      // Process mint asynchronously
      this.processMint(badgeMint.id).catch(error => {
        logger.error(`Async mint processing failed for mint ${badgeMint.id}:`, error);
      });

      return {
        success: true,
        mintId: badgeMint.id
      };

    } catch (error) {
      logger.error('Mint initiation failed:', error);
      return {
        success: false,
        error: 'Failed to initiate mint'
      };
    }
  }

  private async processMint(mintId: string): Promise<void> {
    const mint = await this.badgeMintRepository.findOne({ 
      where: { id: mintId },
      relations: ['badgeType']
    });

    if (!mint) {
      logger.error(`Mint record not found: ${mintId}`);
      return;
    }

    try {
      // Update metadata to show processing started
      mint.metadata = {
        ...mint.metadata,
        processingStartedAt: new Date().toISOString(),
        status: 'processing'
      };
      await this.badgeMintRepository.save(mint);

      // Call smart contract to mint
      const result = await this.web3Service.mintBadge(
        mint.wallet,
        Number(mint.badgeType.contractBadgeTypeId) || 1 // Use contractBadgeTypeId or default to 1
      );

      // Update mint record with success
      mint.tokenId = result.tokenId.toString();
      mint.transactionHash = result.transactionHash;
      mint.metadata = {
        ...mint.metadata,
        status: 'success',
        completedAt: new Date().toISOString(),
        contractAddress: result.contractAddress,
        gasUsed: result.gasUsed?.toString(),
        blockNumber: result.blockNumber,
        transactionUrl: this.getTransactionUrl(result.transactionHash)
      };

      await this.badgeMintRepository.save(mint);

      logger.info(`Badge minted successfully: ${mint.tokenId} for ${mint.wallet}, TX: ${mint.transactionHash}`);

      // Trigger webhook for badge minted
      // await this.webhookService.notifyBadgeMinted(mint);

    } catch (error) {
      logger.error(`Mint processing failed for mint ${mintId}:`, error);
      
      // Update mint record with failure
      mint.metadata = {
        ...mint.metadata,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: new Date().toISOString()
      };
      
      await this.badgeMintRepository.save(mint);
    }
  }

  async getMintStatus(mintId: string): Promise<BadgeMint | null> {
    return this.badgeMintRepository.findOne({
      where: { id: mintId },
      relations: ['badgeType', 'verification']
    });
  }

  async getUserMints(wallet: string): Promise<BadgeMint[]> {
    return this.badgeMintRepository.find({
      where: { wallet },
      relations: ['badgeType'],
      order: { createdAt: 'DESC' }
    });
  }

  async getActiveUserBadges(wallet: string): Promise<BadgeMint[]> {
    return this.badgeMintRepository.find({
      where: { 
        wallet,
        isRevoked: false,
        tokenId: { $not: { $eq: null } } as any // Has been successfully minted
      },
      relations: ['badgeType'],
      order: { createdAt: 'DESC' }
    });
  }

  async revokeBadge(mintId: string, reason: string): Promise<boolean> {
    try {
      const mint = await this.badgeMintRepository.findOne({ 
        where: { id: mintId } 
      });

      if (!mint) {
        throw new Error('Mint record not found');
      }

      mint.isRevoked = true;
      mint.revokeReason = reason;
      mint.metadata = {
        ...mint.metadata,
        revokedAt: new Date().toISOString(),
        revokeReason: reason
      };

      await this.badgeMintRepository.save(mint);

      logger.info(`Badge revoked: ${mintId}, reason: ${reason}`);

      return true;
    } catch (error) {
      logger.error(`Failed to revoke badge ${mintId}:`, error);
      return false;
    }
  }

  async getMintByTransactionHash(transactionHash: string): Promise<BadgeMint | null> {
    return this.badgeMintRepository.findOne({
      where: { transactionHash },
      relations: ['badgeType']
    });
  }

  private getTransactionUrl(transactionHash: string): string {
    const chainId = process.env.DEFAULT_CHAIN_ID || '1';
    const explorers: { [key: string]: string } = {
      '1': 'https://etherscan.io/tx/',
      '137': 'https://polygonscan.com/tx/',
      '80001': 'https://mumbai.polygonscan.com/tx/',
      '11155111': 'https://sepolia.etherscan.io/tx/'
    };
    
    return `${explorers[chainId] || explorers['1']}${transactionHash}`;
  }

  // New method: Check if user can mint a specific badge type
  async canMintBadge(wallet: string, badgeTypeKey: string): Promise<{
    canMint: boolean;
    reason?: string;
    existingMint?: BadgeMint;
  }> {
    try {
      // Check eligibility first
      const eligibility = await this.eligibilityService.checkEligibility(wallet, badgeTypeKey);
      if (!eligibility.eligible) {
        return {
            canMint: false,
            reason: eligibility.reasons.join(', ') || 'Not eligible for this badge'
          };
      }

      // Check for existing active mint
      const badgeType = await this.badgeTypeRepository.findOne({ 
        where: { key: badgeTypeKey } 
      });

      if (!badgeType) {
        return {
          canMint: false,
          reason: 'Badge type not found'
        };
      }

      const existingMint = await this.badgeMintRepository.findOne({
        where: {
          wallet,
          badgeTypeId: badgeType.id,
          isRevoked: false
        }
      });

      if (existingMint) {
        return {
          canMint: false,
          reason: 'Already has an active badge of this type',
          existingMint
        };
      }

      return { canMint: true };
    } catch (error) {
      logger.error('Can mint check failed:', error);
      return {
        canMint: false,
        reason: 'Error checking mint eligibility'
      };
    }
  }
}

// Update the Web3 service to work with your entity
export const mintingService = new MintingService(
  new Web3Service(), // You'll need to implement this
  new EligibilityService()
);