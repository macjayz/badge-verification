import { AppDataSource } from '../db/datasource';
import { IssuerProfile } from '../entities/IssuerProfile';
import { ProjectSocialRules } from '../entities/ProjectSocialRules';
import { Issuer } from '../entities/Issuer';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Verification } from '../entities/Verification';
import { SUPPORTED_RULE_METHODS } from './rule-support';
import { logger } from '../utils/logger';

const issuerProfileRepository = AppDataSource.getRepository(IssuerProfile);
const projectSocialRulesRepository = AppDataSource.getRepository(ProjectSocialRules);
const issuerRepository = AppDataSource.getRepository(Issuer);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);
const verificationRepository = AppDataSource.getRepository(Verification);

const EDITABLE_PROFILE_FIELDS = [
  'projectName', 'description', 'website', 'contactEmail', 'twitterHandle',
  'discordServerId', 'discordServerName', 'snapshotSpace', 'githubOrganization', 'socialConfig'
] as const;

export interface IssuerDashboardStats {
  totalBadges: number;
  activeBadges: number;
  totalMints: number;
  successfulMints: number;
  failedMints: number;
  successRate: number;
  recentActivity: Array<{
    date: string;
    mints: number;
    completed: number;
    verifications: number;
    newWallets: number;
  }>;
  verificationRates: Record<string, { completed: number; total: number }>;
  avgMintSeconds: number | null;
  topBadges: Array<{
    id: string;
    name: string;
    mints: number;
    successRate: number;
  }>;
}

export interface SocialRuleTemplate {
  type: string;
  name: string;
  description: string;
  parameters: any;
  required: boolean;
}

export class IssuerDashboardService {
  async createIssuerProfile(
    issuerId: string,
    projectName: string,
    description?: string,
    website?: string,
    contactEmail?: string,
    socialConfig?: {
      twitterHandle?: string;
      discordServerId?: string;
      discordServerName?: string;
      snapshotSpace?: string;
      githubOrganization?: string;
    }
  ): Promise<IssuerProfile> {
    const existingProfile = await issuerProfileRepository.findOne({
      where: { issuerId }
    });

    if (existingProfile) {
      throw new Error('Issuer profile already exists');
    }

    const issuer = await issuerRepository.findOne({
      where: { id: issuerId }
    });

    if (!issuer) {
      throw new Error('Issuer not found');
    }

    const profile = issuerProfileRepository.create({
      issuerId,
      projectName,
      description,
      website,
      contactEmail,
      twitterHandle: socialConfig?.twitterHandle,
      discordServerId: socialConfig?.discordServerId,
      discordServerName: socialConfig?.discordServerName,
      snapshotSpace: socialConfig?.snapshotSpace,
      githubOrganization: socialConfig?.githubOrganization,
      onboardingStatus: 'completed'
    });

    await issuerProfileRepository.save(profile);

    logger.info(`Created issuer profile for: ${projectName} (${issuerId})`);

    return profile;
  }

  async getIssuerProfile(issuerId: string): Promise<IssuerProfile | null> {
    return issuerProfileRepository.findOne({
      where: { issuerId },
      relations: ['issuer']
    });
  }

  async updateIssuerProfile(
    issuerId: string,
    updates: Partial<{
      projectName: string;
      description: string;
      website: string;
      contactEmail: string;
      twitterHandle: string;
      discordServerId: string;
      discordServerName: string;
      snapshotSpace: string;
      githubOrganization: string;
      socialConfig: any;
    }>
  ): Promise<IssuerProfile> {
    const profile = await issuerProfileRepository.findOne({
      where: { issuerId }
    });

    if (!profile) {
      throw new Error('Issuer profile not found');
    }

    // Copy only editable fields; isVerified, onboardingStatus and issuerId are not the issuer's to set.
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (updates[field] !== undefined) {
        (profile as any)[field] = updates[field];
      }
    }
    await issuerProfileRepository.save(profile);

    logger.info(`Updated issuer profile for: ${profile.projectName}`);

    return profile;
  }

  async createSocialRule(
    issuerId: string,
    ruleType: string,
    name: string,
    parameters: any,
    description?: string,
    isRequired: boolean = false,
    priority: number = 0
  ): Promise<ProjectSocialRules> {
    const issuer = await issuerRepository.findOne({
      where: { id: issuerId }
    });

    if (!issuer) {
      throw new Error('Issuer not found');
    }

    if (!SUPPORTED_RULE_METHODS.includes(ruleType)) {
      throw new Error(`Unsupported rule type "${ruleType}". Supported: ${SUPPORTED_RULE_METHODS.join(', ')}`);
    }

    const rule = new ProjectSocialRules();
    rule.issuerId = issuerId;
    rule.ruleType = ruleType as any; // Type assertion for the enum
    rule.name = name;
    rule.description = description;
    rule.parameters = parameters;
    rule.isRequired = isRequired;
    rule.priority = priority;
    rule.isActive = true;

    await projectSocialRulesRepository.save(rule);

    logger.info(`Created social rule: ${name} for issuer: ${issuer.name}`);

    return rule;
  }

  async getIssuerSocialRules(issuerId: string): Promise<ProjectSocialRules[]> {
    return projectSocialRulesRepository.find({
      where: { issuerId },
      order: { priority: 'DESC', createdAt: 'DESC' }
    });
  }

  async updateSocialRule(
    ruleId: string,
    issuerId: string,
    updates: Partial<{
      name: string;
      description: string;
      parameters: any;
      isActive: boolean;
      isRequired: boolean;
      priority: number;
    }>
  ): Promise<ProjectSocialRules> {
    const rule = await projectSocialRulesRepository.findOne({
      where: { id: ruleId, issuerId }
    });

    if (!rule) {
      throw new Error('Social rule not found');
    }

    Object.assign(rule, updates);
    await projectSocialRulesRepository.save(rule);

    logger.info(`Updated social rule: ${rule.name}`);

    return rule;
  }

  async deleteSocialRule(ruleId: string, issuerId: string): Promise<void> {
    const rule = await projectSocialRulesRepository.findOne({
      where: { id: ruleId, issuerId }
    });

    if (!rule) {
      throw new Error('Social rule not found');
    }

    await projectSocialRulesRepository.remove(rule);

    logger.info(`Deleted social rule: ${rule.name}`);
  }

  async getIssuerDashboardStats(issuerId: string, days = 30): Promise<IssuerDashboardStats> {
    // Get issuer's badges
    const badges = await badgeTypeRepository.find({
      where: { issuer: { id: issuerId } },
      relations: ['mints']
    });

    // Calculate stats
    const totalBadges = badges.length;
    const activeBadges = badges.filter(b => b.isActive).length;

    const allMints = badges.flatMap(badge => badge.mints || []);
    const totalMints = allMints.length;

    // Use metadata.status instead of direct status property
    const isCompleted = (mint: BadgeMint) => ['completed', 'success'].includes(mint.metadata?.status);
    const successfulMints = allMints.filter(isCompleted).length;
    const failedMints = allMints.filter(mint => mint.metadata?.status === 'failed').length;
    const successRate = totalMints > 0 ? (successfulMints / totalMints) * 100 : 0;

    const recentActivity = await this.getRecentActivity(issuerId, days);
    const verificationRates = await this.getVerificationRates(issuerId);

    // Time from the mint request to its confirmation, over completed mints.
    const durations = allMints
      .filter(isCompleted)
      .map(mint => (new Date(mint.updatedAt).getTime() - new Date(mint.createdAt).getTime()) / 1000)
      .filter(seconds => seconds >= 0);
    const avgMintSeconds = durations.length
      ? Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length)
      : null;

    // Get top badges by mint count
    const topBadges = badges
      .map(badge => {
        const badgeMints = badge.mints || [];
        // Use metadata.status
        const completedMints = badgeMints.filter(isCompleted).length;
        const badgeSuccessRate = badgeMints.length > 0
          ? (completedMints / badgeMints.length) * 100
          : 0;

        return {
          id: badge.id,
          name: badge.name,
          mints: badgeMints.length,
          successRate: badgeSuccessRate
        };
      })
      .sort((a, b) => b.mints - a.mints)
      .slice(0, 5);

    return {
      totalBadges,
      activeBadges,
      totalMints,
      successfulMints,
      failedMints,
      successRate,
      recentActivity,
      verificationRates,
      avgMintSeconds,
      topBadges
    };
  }

  private async getRecentActivity(issuerId: string, days: number): Promise<IssuerDashboardStats['recentActivity']> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const dayOf = (column: string) => `to_char(date_trunc('day', ${column} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

    const mintRows: Array<{ day: string; mints: string; completed: string }> = await badgeMintRepository
      .createQueryBuilder('mint')
      .innerJoin('mint.badgeType', 'badgeType')
      .select(dayOf('mint.createdAt'), 'day')
      .addSelect('COUNT(*)', 'mints')
      .addSelect("COUNT(CASE WHEN mint.metadata ->> 'status' IN ('completed', 'success') THEN 1 END)", 'completed')
      .where('badgeType.issuerId = :issuerId', { issuerId })
      .andWhere('mint.createdAt >= :since', { since })
      .groupBy('day')
      .getRawMany();

    // A wallet counts as new on the day of its first mint of any of this issuer's badges.
    const firstMintRows: Array<{ day: string; count: string }> = await AppDataSource.query(
      `SELECT to_char(date_trunc('day', first_mint AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM (SELECT mint.wallet, MIN(mint."createdAt") AS first_mint
                 FROM badge_mints mint
                 JOIN badge_types badge_type ON badge_type.id = mint."badgeTypeId"
                WHERE badge_type."issuerId" = $1
                GROUP BY mint.wallet) firsts
        WHERE first_mint >= $2
        GROUP BY day`,
      [issuerId, since]
    );

    const verificationRows: Array<{ day: string; count: string }> = await verificationRepository
      .createQueryBuilder('verification')
      .select(dayOf('verification.createdAt'), 'day')
      .addSelect('COUNT(*)', 'count')
      .where("verification.metadata ->> 'issuerId' = :issuerId", { issuerId })
      .andWhere('verification.createdAt >= :since', { since })
      .groupBy('day')
      .getRawMany();

    const mints = new Map(mintRows.map(row => [row.day, row]));
    const newWallets = new Map(firstMintRows.map(row => [row.day, Number(row.count)]));
    const verifications = new Map(verificationRows.map(row => [row.day, Number(row.count)]));

    return Array.from({ length: days }, (_, i) => {
      const day = new Date(since);
      day.setUTCDate(since.getUTCDate() + i);
      const date = day.toISOString().slice(0, 10);
      return {
        date,
        mints: Number(mints.get(date)?.mints ?? 0),
        completed: Number(mints.get(date)?.completed ?? 0),
        verifications: verifications.get(date) ?? 0,
        newWallets: newWallets.get(date) ?? 0
      };
    });
  }

  private async getVerificationRates(issuerId: string): Promise<IssuerDashboardStats['verificationRates']> {
    const rows: Array<{ provider: string; completed: string; total: string }> = await verificationRepository
      .createQueryBuilder('verification')
      .select('verification.provider', 'provider')
      .addSelect("COUNT(CASE WHEN verification.status = 'completed' THEN 1 END)", 'completed')
      .addSelect('COUNT(*)', 'total')
      .where("verification.metadata ->> 'issuerId' = :issuerId", { issuerId })
      .groupBy('verification.provider')
      .getRawMany();
    return Object.fromEntries(rows.map(row => [row.provider, { completed: Number(row.completed), total: Number(row.total) }]));
  }

  /** Mints of this issuer's badges, newest first, for exports. */
  async getIssuerMints(issuerId: string, limit = 1000) {
    const mints = await badgeMintRepository
      .createQueryBuilder('mint')
      .innerJoinAndSelect('mint.badgeType', 'badgeType')
      .where('badgeType.issuerId = :issuerId', { issuerId })
      .orderBy('mint.createdAt', 'DESC')
      .take(Math.min(Math.max(limit, 1), 10000))
      .getMany();

    return mints.map(mint => ({
      id: mint.id,
      createdAt: mint.createdAt,
      badgeKey: mint.badgeType.key,
      badgeName: mint.badgeType.name,
      wallet: mint.wallet,
      status: mint.metadata?.status === 'success' ? 'completed' : mint.metadata?.status ?? 'unknown',
      tokenId: mint.tokenId ?? null,
      transactionHash: mint.transactionHash ?? null,
      revoked: mint.isRevoked
    }));
  }

  async getSocialRuleTemplates(): Promise<SocialRuleTemplate[]> {
    return [
      {
        type: 'twitter_follow',
        name: 'Twitter Follow',
        description: 'Require users to follow your Twitter account',
        parameters: { account: '' },
        required: true
      },
      {
        type: 'discord_member',
        name: 'Discord Member',
        description: 'Require users to join your Discord server',
        parameters: { serverId: '', requiredRole: '' },
        required: true
      },
      {
        type: 'snapshot_votes',
        name: 'Snapshot Votes',
        description: 'Require users to vote on your Snapshot proposals',
        parameters: { space: '', minVotes: 1 },
        required: false
      },
      {
        type: 'onchain_activity',
        name: 'On-chain Activity',
        description: 'Require users to have on-chain transaction history',
        parameters: { minTransactions: 1 },
        required: false
      }
    ];
  }

  async generateBadgeRulesFromSocialRules(issuerId: string): Promise<any> {
    const socialRules = await this.getIssuerSocialRules(issuerId);
    const activeRules = socialRules.filter(rule => rule.isActive);

    const secondaryRules = activeRules.map(rule => ({
      method: rule.ruleType,
      required: rule.isRequired,
      params: rule.parameters
    }));

    return {
      primary: ['privadoid'],
      secondary: secondaryRules,
      logic: 'AND' // Default to AND logic for social rules
    };
  }
}

export const issuerDashboardService = new IssuerDashboardService();