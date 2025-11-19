// src/services/eligibility.service.ts
import { AppDataSource } from '../db/datasource';
import { BadgeType, BadgeRules } from '../entities/BadgeType';
import { Verification } from '../entities/Verification';
import { verificationService } from './verification.service';
import { logger } from '../utils/logger';
import { 
  EligibilityError, 
  ValidationError, 
  NotFoundError 
} from '../utils/errors'; // ADD THIS IMPORT

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
      // Validate inputs
      if (!wallet || !badgeKey) {
        throw new ValidationError('Wallet and badge key are required', {
          fields: { wallet: !wallet, badgeKey: !badgeKey }
        });
      }

      logger.info(`Checking eligibility for wallet: ${wallet}, badge: ${badgeKey}`);

      // Get badge type and rules
      const badgeType = await badgeTypeRepository.findOne({
        where: { key: badgeKey, isActive: true },
        relations: ['issuer']
      });

      if (!badgeType) {
        throw new NotFoundError('Badge type', badgeKey);
      }

      if (!badgeType.isActive) {
        throw new EligibilityError(
          badgeKey,
          'Badge type is currently inactive',
          { 
            badgeName: badgeType.name,
            suggestion: 'Contact the issuer for more information'
          }
        );
      }

      const rules = badgeType.rules;
      
      // Validate rules structure
      if (!rules?.primary || !Array.isArray(rules.primary)) {
        throw new EligibilityError(
          badgeKey,
          'Invalid badge rules configuration',
          { 
            badgeName: badgeType.name,
            suggestion: 'Contact issuer to fix badge configuration'
          }
        );
      }
      
      // Check primary requirements (DID verification)
      const primaryResults = await this.checkPrimaryRequirements(wallet, rules.primary, rules.logic);
      
      // Check secondary requirements (social/on-chain)
      const secondaryResults = await this.checkSecondaryRequirements(wallet, rules.secondary || [], rules.logic);

      // Determine overall eligibility
      const primaryEligible = this.evaluatePrimaryLogic(primaryResults, rules.logic);
      const secondaryEligible = this.evaluateSecondaryLogic(secondaryResults, rules.logic);
      
      const eligible = primaryEligible && secondaryEligible;

      // Build reasons and missing requirements
      const { reasons, missingRequirements } = this.buildEligibilityDetails(
        primaryResults, 
        secondaryResults, 
        rules,
        primaryEligible,
        badgeType.name
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
      if (error instanceof EligibilityError || error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error(`Eligibility check error for ${wallet}, badge ${badgeKey}:`, error);
      throw new EligibilityError(
        badgeKey,
        `Unexpected error during eligibility check: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { wallet, badgeKey }
      );
    }
  }

  private async checkPrimaryRequirements(
    wallet: string, 
    primaryProviders: string[], 
    logic: 'AND' | 'OR' = 'OR'
  ): Promise<Array<{ provider: string; verified: boolean; did?: string }>> {
    const results = [];

    for (const provider of primaryProviders) {
      try {
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
      } catch (error: any) {
        logger.error(`Error checking primary requirement ${provider} for ${wallet}:`, error);
        results.push({
          provider,
          verified: false,
          error: error.message
        });
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

    for (const rule of secondaryRules || []) {
      try {
        const verificationResult = await this.verifySecondaryRule(wallet, rule);
        results.push({
          method: rule.method,
          verified: verificationResult.verified,
          required: rule.required !== false, // default to true if not specified
          details: verificationResult.details
        });

        if (verificationResult.verified) {
          logger.debug(`Secondary requirement satisfied: ${rule.method} for ${wallet}`);
        } else {
          logger.debug(`Secondary requirement failed: ${rule.method} for ${wallet}`);
        }

      } catch (error: any) {
        logger.error(`Error checking secondary rule ${rule.method} for ${wallet}:`, error);
        results.push({
          method: rule.method,
          verified: false,
          required: rule.required !== false,
          details: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            suggestion: 'Verification service temporarily unavailable'
          }
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
        throw new EligibilityError(
          'unknown',
          `Unsupported verification method: ${rule.method}`,
          { 
            method: rule.method,
            suggestion: 'Contact issuer to update badge requirements'
          }
        );
    }
  }

  // Mock implementations - will be replaced with real adapters
  private async mockTwitterFollowCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    if (!params?.account) {
      throw new ValidationError('Twitter account parameter is required for follow check', {
        params,
        suggestion: 'Check badge configuration - Twitter account must be specified'
      });
    }

    // Mock: 70% success rate for testing
    const verified = Math.random() > 0.3;
    return {
      verified,
      details: {
        account: params.account,
        requiredAction: `Follow @${params.account} on Twitter`,
        checkedAt: new Date().toISOString(),
        mock: true,
        note: 'This is a mock implementation - will be replaced with real Twitter API'
      }
    };
  }

  private async mockOnChainActivityCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    const minTransactions = params?.minTransactions || 1;
    const beforeDate = params?.beforeDate ? new Date(params.beforeDate) : new Date();
    
    if (minTransactions < 0) {
      throw new ValidationError('Minimum transactions must be a positive number', {
        minTransactions,
        suggestion: 'Check badge configuration - minTransactions must be >= 0'
      });
    }

    // Mock: Random transaction count between 0-20
    const transactionCount = Math.floor(Math.random() * 21);
    const verified = transactionCount >= minTransactions;
    
    return {
      verified,
      details: {
        transactionCount,
        minRequired: minTransactions,
        beforeDate: beforeDate.toISOString(),
        requirement: `Minimum ${minTransactions} on-chain transaction(s)`,
        mock: true,
        note: 'This is a mock implementation - will be replaced with real blockchain data'
      }
    };
  }

  private async mockSnapshotVotesCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    const minVotes = params?.minVotes || 1;
    const space = params?.space || 'daospace.eth';
    
    if (minVotes < 0) {
      throw new ValidationError('Minimum votes must be a positive number', {
        minVotes,
        suggestion: 'Check badge configuration - minVotes must be >= 0'
      });
    }

    // Mock: Random vote count between 0-5
    const voteCount = Math.floor(Math.random() * 6);
    const verified = voteCount >= minVotes;
    
    return {
      verified,
      details: {
        voteCount,
        minRequired: minVotes,
        space,
        requirement: `Minimum ${minVotes} vote(s) in ${space} Snapshot space`,
        mock: true,
        note: 'This is a mock implementation - will be replaced with real Snapshot API'
      }
    };
  }

  private async mockOnChainGovernanceCheck(wallet: string, params: any): Promise<{ verified: boolean; details?: any }> {
    const minVotes = params?.minVotes || 1;
    
    if (minVotes < 0) {
      throw new ValidationError('Minimum governance votes must be a positive number', {
        minVotes,
        suggestion: 'Check badge configuration - minVotes must be >= 0'
      });
    }

    // Mock: Random governance participation
    const hasParticipated = Math.random() > 0.5;
    const verified = hasParticipated;
    
    return {
      verified,
      details: {
        hasParticipated,
        minRequired: minVotes,
        requirement: `Participate in on-chain governance`,
        mock: true,
        note: 'This is a mock implementation - will be replaced with real governance data'
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

    // For secondary requirements, only required ones matter for eligibility
    const requiredResults = results.filter(result => result.required !== false);

    if (requiredResults.length === 0) return true;

    if (logic === 'AND') {
      return requiredResults.every(result => result.verified);
    } else { // OR logic
      return requiredResults.some(result => result.verified);
    }
  }

  private buildEligibilityDetails(
    primaryResults: Array<{ provider: string; verified: boolean }>,
    secondaryResults: Array<{ method: string; verified: boolean; required?: boolean; details?: any }>,
    rules: BadgeRules,
    primaryEligible: boolean,
    badgeName: string
  ): { reasons: string[]; missingRequirements: string[] } {
    const reasons: string[] = [];
    const missingRequirements: string[] = [];

    // Primary requirements analysis
    const successfulPrimary = primaryResults.filter(r => r.verified);
    const failedPrimary = primaryResults.filter(r => !r.verified);

    if (rules.logic === 'AND') {
      // For AND logic, all primary must pass
      successfulPrimary.forEach(result => {
        reasons.push(`Identity verified with ${result.provider}`);
      });
      failedPrimary.forEach(result => {
        missingRequirements.push(`Missing ${result.provider} identity verification`);
      });
    } else {
      // For OR logic, at least one primary must pass
      if (successfulPrimary.length > 0) {
        reasons.push(`Identity verified with ${successfulPrimary.map(r => r.provider).join(' or ')}`);
      } else {
        missingRequirements.push(`Missing identity verification (need one of: ${primaryResults.map(r => r.provider).join(', ')})`);
      }
    }

    // Secondary requirements analysis
    secondaryResults.forEach((result, index) => {
      const rule = rules.secondary?.[index];
      const isRequired = rule?.required !== false;

      if (result.verified) {
        reasons.push(`✓ ${result.method} requirement satisfied`);
      } else if (isRequired) {
        const requirementText = result.details?.requirement || result.method;
        missingRequirements.push(`✗ ${requirementText}`);
        
        // Add specific suggestions if available
        if (result.details?.requiredAction) {
          missingRequirements.push(`  → ${result.details.requiredAction}`);
        }
      } else {
        reasons.push(`○ Optional ${result.method} not satisfied`);
      }
    });

    // Add overall summary
    if (primaryEligible && missingRequirements.length === 0) {
      reasons.unshift(`Eligible for ${badgeName}`);
    } else if (!primaryEligible) {
      missingRequirements.unshift('Identity verification requirements not met');
    }

    return { reasons, missingRequirements };
  }

  async checkAllEligibilities(wallet: string): Promise<{
    wallet: string;
    eligibleBadges: EligibilityResult[];
    ineligibleBadges: EligibilityResult[];
    summary: {
      total: number;
      eligible: number;
      ineligible: number;
      successRate: number;
    };
  }> {
    if (!wallet) {
      throw new ValidationError('Wallet address is required', {
        field: 'wallet',
        required: true
      });
    }

    const allBadgeTypes = await badgeTypeRepository.find({
      where: { isActive: true },
      relations: ['issuer']
    });

    if (allBadgeTypes.length === 0) {
      throw new NotFoundError('Active badge types');
    }

    const results: EligibilityResult[] = [];
    
    // Check each badge type
    for (const badge of allBadgeTypes) {
      try {
        const result = await this.checkEligibility(wallet, badge.key);
        results.push(result);
      } catch (error) {
        logger.error(`Error checking eligibility for badge ${badge.key}:`, error);
        // Create error result for failed checks
        results.push({
          eligible: false,
          badgeKey: badge.key,
          badgeName: badge.name,
          reasons: ['Eligibility check failed'],
          missingRequirements: ['System error - please try again later'],
          proofs: {
            primary: [],
            secondary: []
          }
        });
      }
    }

    const eligibleBadges = results.filter(result => result.eligible);
    const ineligibleBadges = results.filter(result => !result.eligible);

    return {
      wallet,
      eligibleBadges,
      ineligibleBadges,
      summary: {
        total: results.length,
        eligible: eligibleBadges.length,
        ineligible: ineligibleBadges.length,
        successRate: results.length > 0 ? (eligibleBadges.length / results.length) * 100 : 0
      }
    };
  }
}

export const eligibilityService = new EligibilityService();