import { AppDataSource } from '../db/datasource';
import { BadgeType, BadgeRules } from '../entities/BadgeType';
import { Verification } from '../entities/Verification';
import { verificationService } from './verification.service';
import { logger } from '../utils/logger';

// Create repositories directly in this file
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const verificationRepository = AppDataSource.getRepository(Verification);

export interface EligibilityResult {
  eligible: boolean;
  badgeKey: string;
  badgeName: string;
  reasons: string[];
  missingRequirements: string[];
  proofs: {
    primary: Array<{ provider: string; verified: boolean; did?: string }>;
    secondary: Array<{ method: string; verified: boolean; details?: any }>;
  };
}

export class EligibilityService {
  async checkEligibility(wallet: string, badgeKey: string): Promise<EligibilityResult> {
    try {
      logger.info(`Checking eligibility for wallet: ${wallet}, badge: ${badgeKey}`);

      // Get badge type and rules
      const badgeType = await badgeTypeRepository.findOne({
        where: { key: badgeKey, isActive: true },
        relations: ['issuer']
      });

      if (!badgeType) {
        throw new Error(`Badge type not found: ${badgeKey}`);
      }

      const rules = badgeType.rules;
      
      // Check primary requirements (DID verification)
      const primaryResults = await this.checkPrimaryRequirements(wallet, rules.primary, rules.logic);
      
      // Check secondary requirements (social/on-chain)
      const secondaryResults = await this.checkSecondaryRequirements(wallet, rules.secondary, rules.logic);

      // Determine overall eligibility
      const primaryEligible = this.evaluatePrimaryLogic(primaryResults, rules.logic);
      const secondaryEligible = this.evaluateSecondaryLogic(secondaryResults, rules.logic);
      
      const eligible = primaryEligible && secondaryEligible;

      // Build reasons and missing requirements
      const { reasons, missingRequirements } = this.buildEligibilityDetails(
        primaryResults, 
        secondaryResults, 
        rules,
        primaryEligible
      );

      return {
        eligible,
        badgeKey: badgeType.key,
        badgeName: badgeType.name,
        reasons,
        missingRequirements,
        proofs: {
          primary: primaryResults,
          secondary: secondaryResults
        }
      };

    } catch (error) {
      logger.error(`Eligibility check error for ${wallet}, badge ${badgeKey}:`, error);
      throw error;
    }
  }

  private async checkPrimaryRequirements(
    wallet: string, 
    primaryProviders: string[], 
    logic: 'AND' | 'OR' = 'OR'
  ): Promise<Array<{ provider: string; verified: boolean; did?: string }>> {
    const results = [];

    for (const provider of primaryProviders) {
      // Check for active verifications from this provider
      const activeVerifications = await verificationService.getActiveVerifications(wallet, provider);
      const validVerification = activeVerifications.find(v => v.canBeUsed());

      if (validVerification) {
        results.push({
          provider,
          verified: true,
          did: validVerification.did
        });
        logger.debug(`Primary requirement satisfied: ${provider} for ${wallet}`);
      } else {
        results.push({
          provider,
          verified: false
        });
        logger.debug(`Primary requirement missing: ${provider} for ${wallet}`);
      }
    }

    return results;
  }

  private async checkSecondaryRequirements(
    wallet: string, 
    secondaryRules: BadgeRules['secondary'],
    logic: 'AND' | 'OR' = 'AND'
  ): Promise<Array<{ method: string; verified: boolean; details?: any }>> {
    const results = [];

    for (const rule of secondaryRules) {
      try {
        const verificationResult = await this.verifySecondaryRule(wallet, rule);
        results.push({
          method: rule.method,
          verified: verificationResult.verified,
          details: verificationResult.details
        });

        if (verificationResult.verified) {
          logger.debug(`Secondary requirement satisfied: ${rule.method} for ${wallet}`);
        } else {
          logger.debug(`Secondary requirement failed: ${rule.method} for ${wallet}`);
        }

      } catch (error) {
        logger.error(`Error checking secondary rule ${rule.method} for ${wallet}:`, error);
        results.push({
          method: rule.method,
          verified: false,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }

    return results;
  }

  private async verifySecondaryRule(
    wallet: string, 
    rule: BadgeRules['secondary'][0]
  ): Promise<{ verified: boolean; details?: any }> {
    // For now, use mock/stub implementations
    // These will be replaced with real adapters in Step 7
    switch (rule.method) {
      case 'twitter_follow':
        return await this.mockTwitterFollowCheck(wallet, rule.params);
      
      case 'onchain_activity':
        return await this.mockOnChainActivityCheck(wallet, rule.params);
      
      case 'snapshot_votes':
        return await this.mockSnapshotVotesCheck(wallet, rule.params);
      
      case 'onchain_governance':
        return await this.mockOnChainGovernanceCheck(wallet, rule.params);
      
      default:
        logger.warn(`Unknown secondary verification method: ${rule.method}`);
        return { verified: false, details: { error: 'Unknown verification method' } };
    }
  }

  // Mock implementations - will be replaced with real adapters
  private async mockTwitterFollowCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    // Mock: 70% success rate for testing
    const verified = Math.random() > 0.3;
    return {
      verified,
      details: {
        account: params?.account || 'unknown',
        checkedAt: new Date().toISOString(),
        mock: true
      }
    };
  }

  private async mockOnChainActivityCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    // Mock: Check if wallet has required transactions
    const minTransactions = params?.minTransactions || 1;
    const beforeDate = params?.beforeDate ? new Date(params.beforeDate) : new Date();
    
    // Mock: Random transaction count between 0-20
    const transactionCount = Math.floor(Math.random() * 21);
    const verified = transactionCount >= minTransactions;
    
    return {
      verified,
      details: {
        transactionCount,
        minRequired: minTransactions,
        beforeDate: beforeDate.toISOString(),
        mock: true
      }
    };
  }

  private async mockSnapshotVotesCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    // Mock: Check Snapshot voting history
    const minVotes = params?.minVotes || 1;
    const space = params?.space || 'daospace.eth';
    
    // Mock: Random vote count between 0-5
    const voteCount = Math.floor(Math.random() * 6);
    const verified = voteCount >= minVotes;
    
    return {
      verified,
      details: {
        voteCount,
        minRequired: minVotes,
        space,
        mock: true
      }
    };
  }

  private async mockOnChainGovernanceCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    // Mock: Check on-chain governance participation
    const minVotes = params?.minVotes || 1;
    
    // Mock: Random governance participation
    const hasParticipated = Math.random() > 0.5;
    const verified = hasParticipated;
    
    return {
      verified,
      details: {
        hasParticipated,
        minRequired: minVotes,
        mock: true
      }
    };
  }

  private evaluatePrimaryLogic(
    results: Array<{ provider: string; verified: boolean }>,
    logic: 'AND' | 'OR' = 'OR'
  ): boolean {
    if (results.length === 0) return true;

    if (logic === 'AND') {
      return results.every(result => result.verified);
    } else { // OR logic
      return results.some(result => result.verified);
    }
  }

  private evaluateSecondaryLogic(
    results: Array<{ method: string; verified: boolean; required?: boolean }>,
    logic: 'AND' | 'OR' = 'AND'
  ): boolean {
    if (results.length === 0) return true;

    if (logic === 'AND') {
      return results.every(result => result.verified);
    } else { // OR logic
      return results.some(result => result.verified);
    }
  }

  private buildEligibilityDetails(
    primaryResults: Array<{ provider: string; verified: boolean }>,
    secondaryResults: Array<{ method: string; verified: boolean; details?: any }>,
    rules: BadgeRules,
    primaryEligible: boolean
  ): { reasons: string[]; missingRequirements: string[] } {
    const reasons: string[] = [];
    const missingRequirements: string[] = [];

    // Primary requirements - only show missing if using AND logic or not eligible
    if (rules.logic === 'AND' || !primaryEligible) {
      primaryResults.forEach(result => {
        if (result.verified) {
          reasons.push(`Verified with ${result.provider}`);
        } else {
          missingRequirements.push(`Missing ${result.provider} verification`);
        }
      });
    } else {
      // For OR logic and eligible, only show the successful ones
      primaryResults.forEach(result => {
        if (result.verified) {
          reasons.push(`Verified with ${result.provider}`);
        }
      });
    }

    // Secondary requirements
    secondaryResults.forEach((result, index) => {
      const rule = rules.secondary[index];
      if (result.verified) {
        reasons.push(`Satisfied ${result.method} requirement`);
      } else if (rule.required) {
        missingRequirements.push(`Missing required ${result.method}`);
      } else {
        reasons.push(`Optional ${result.method} not satisfied`);
      }
    });

    return { reasons, missingRequirements };
  }

  async checkAllEligibilities(wallet: string): Promise<{
    wallet: string;
    eligibleBadges: EligibilityResult[];
    ineligibleBadges: EligibilityResult[];
  }> {
    const allBadgeTypes = await badgeTypeRepository.find({
      where: { isActive: true },
      relations: ['issuer']
    });

    const results: EligibilityResult[] = [];
    
    // Check each badge type
    for (const badge of allBadgeTypes) {
      try {
        const result = await this.checkEligibility(wallet, badge.key);
        results.push(result);
      } catch (error) {
        logger.error(`Error checking eligibility for badge ${badge.key}:`, error);
        // Continue with other badges even if one fails
      }
    }

    const eligibleBadges = results.filter(result => result.eligible);
    const ineligibleBadges = results.filter(result => !result.eligible);

    return {
      wallet,
      eligibleBadges,
      ineligibleBadges
    };
  }
}

export const eligibilityService = new EligibilityService();