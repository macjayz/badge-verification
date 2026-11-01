import { AppDataSource } from '../db/datasource';
import { BadgeType, BadgeRules } from '../entities/BadgeType';
import { verificationService } from './verification.service';
import { snapshotService } from './snapshot.service';
import { logger } from '../utils/logger';
import {
  EligibilityError,
  ValidationError,
  NotFoundError
} from '../utils/errors';
import { twitterService } from './twitter.service';
import { discordService } from './discord.service';
import { web3Service } from './web3.service';

// Create repositories directly in this file
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);

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
      const primaryResults = await this.checkPrimaryRequirements(wallet, rules.primary);

      // Check secondary requirements (social/on-chain)
      const secondaryResults = await this.checkSecondaryRequirements(wallet, rules.secondary || []);

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
    primaryProviders: string[]
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
    secondaryRules: BadgeRules['secondary']
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
    switch (rule.method) {
      case 'twitter_follow':
        if (!rule.params?.account) {
          return this.misconfigured('Twitter account not specified in badge rules');
        }
        return await twitterService.verifyFollow(wallet, rule.params.account);

      case 'discord_member':
        if (!rule.params?.serverId) {
          return this.misconfigured('Discord server not specified in badge rules');
        }
        return await discordService.verifyServerMembership(wallet, rule.params.serverId);

      case 'snapshot_votes':
        return await this.checkSnapshotVotes(wallet, rule.params);

      case 'onchain_activity':
        return await this.checkOnChainActivity(wallet, rule.params);

      default:
        // Fail closed: a rule this server cannot check must never grant a badge.
        logger.warn(`Unsupported verification method: ${rule.method}`);
        return {
          verified: false,
          details: {
            method: rule.method,
            error: `Verification method "${rule.method}" is not supported`,
            requiredAction: 'Contact the badge issuer to fix this badge\'s rules'
          }
        };
    }
  }

  private misconfigured(error: string): { verified: boolean; details: any } {
    return {
      verified: false,
      details: { error, requiredAction: 'Contact the badge issuer to fix this badge\'s rules' }
    };
  }

  private async checkSnapshotVotes(
    wallet: string,
    params: any
  ): Promise<{ verified: boolean; details?: any }> {
    logger.debug('[ELIGIBILITY] REAL Snapshot check called for wallet:', wallet);

    try {
      const minVotes = params?.minVotes || 1;
      const spaceId = params?.space;
      const proposalId = params?.proposal;
      const timeframe = params?.timeframe;

      const requirements: any = {};
      if (minVotes !== undefined) requirements.minVotes = minVotes;
      if (spaceId) requirements.spaceId = spaceId;
      if (proposalId) requirements.proposalId = proposalId;
      if (timeframe) requirements.timeframe = { days: timeframe.days || 365 };

      logger.debug('Requirements:', requirements);

      const result = await snapshotService.checkVoteRequirements(wallet, requirements);

      logger.debug('Snapshot service result:', {
        meetsRequirements: result.meetsRequirements,
        totalVotes: result.details?.totalVotes,
        message: result.details?.message,
        apiError: result.details?.apiError
      });

      // If API error occurred, verification fails
      if (result.details?.apiError) {
        logger.debug('API error detected - verification fails');
        return {
          verified: false,
          details: {
            ...result.details,
            requirement: 'Snapshot voting verification',
            requiredAction: 'Try again later - Snapshot API is unavailable',
            apiError: true
          }
        };
      }

      return {
        verified: result.meetsRequirements,
        details: {
          ...result.details,
          requirement: `Minimum ${minVotes} Snapshot vote(s)${spaceId ? ` in ${spaceId}` : ''}${timeframe ? ` within last ${timeframe.days} days` : ''}`,
          requiredAction: spaceId
            ? `Vote on proposals in ${spaceId} Snapshot space`
            : `Participate in Snapshot governance voting`,
        }
      };
    } catch (error) {
      logger.error('[ELIGIBILITY] Snapshot check error:', error);
      return {
        verified: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          requirement: 'Snapshot voting verification',
          requiredAction: 'Try again later or contact support',
          checkedAt: new Date().toISOString(),
          apiError: true
        }
      };
    }
  }

  private async checkOnChainActivity(
    wallet: string,
    params: any
  ): Promise<{ verified: boolean; details?: any }> {
    const minTransactions = Number(params?.minTransactions ?? 1);
    const requirement = `Minimum ${minTransactions} on-chain transaction(s)`;
    if (!Number.isInteger(minTransactions) || minTransactions < 0) {
      return this.misconfigured('minTransactions must be a whole number of 0 or more');
    }

    try {
      const transactionCount = await web3Service.getTransactionCount(wallet);
      return {
        verified: transactionCount >= minTransactions,
        details: { transactionCount, minRequired: minTransactions, requirement, checkedAt: new Date().toISOString() }
      };
    } catch (error) {
      logger.error('On-chain activity check failed', { wallet, error });
      return {
        verified: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          requirement,
          requiredAction: 'Try again later',
          apiError: true
        }
      };
    }
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
      } else if (primaryResults.length > 0) {
        missingRequirements.push(`Missing identity verification (need one of: ${primaryResults.map(r => r.provider).join(', ')})`);
      }
    }

    // Secondary requirements analysis
    secondaryResults.forEach((result, index) => {
      const rule = rules.secondary?.[index];
      const isRequired = rule?.required !== false;

      if (result.verified) {
        reasons.push(`${result.method} requirement satisfied`);
      } else if (isRequired) {
        const requirementText = result.details?.requirement || result.details?.error || result.method;
        missingRequirements.push(`${requirementText}`);

        // Add specific suggestions if available
        if (result.details?.requiredAction) {
          missingRequirements.push(`  → ${result.details.requiredAction}`);
        }
      } else {
        reasons.push(`Optional ${result.method} not satisfied`);
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