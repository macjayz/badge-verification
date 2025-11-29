// src/services/issuer-dashboard.service.ts
import { AppDataSource } from '../db/datasource';
import { IssuerProfile } from '../entities/IssuerProfile';
import { ProjectSocialRules } from '../entities/ProjectSocialRules';
import { Issuer } from '../entities/Issuer';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { logger } from '../utils/logger';

const issuerProfileRepository = AppDataSource.getRepository(IssuerProfile);
const projectSocialRulesRepository = AppDataSource.getRepository(ProjectSocialRules);
const issuerRepository = AppDataSource.getRepository(Issuer);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
const badgeMintRepository = AppDataSource.getRepository(BadgeMint);

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
    verifications: number;
  }>;
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

    Object.assign(profile, updates);
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

    // FIXED: Create the rule object properly
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

  async getIssuerDashboardStats(issuerId: string): Promise<IssuerDashboardStats> {
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
    
    // FIXED: Use metadata.status instead of direct status property
    const successfulMints = allMints.filter(mint => mint.metadata?.status === 'completed').length;
    const failedMints = allMints.filter(mint => mint.metadata?.status === 'failed').length;
    const successRate = totalMints > 0 ? (successfulMints / totalMints) * 100 : 0;

    // Get recent activity (last 7 days)
    const recentActivity = await this.getRecentActivity(issuerId);

    // Get top badges by mint count
    const topBadges = badges
      .map(badge => {
        const badgeMints = badge.mints || [];
        // FIXED: Use metadata.status
        const completedMints = badgeMints.filter(m => m.metadata?.status === 'completed').length;
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
      topBadges
    };
  }

  private async getRecentActivity(issuerId: string): Promise<Array<{ date: string; mints: number; verifications: number }>> {
    // Simplified implementation - in production, you'd query by date ranges
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => ({
      date,
      mints: Math.floor(Math.random() * 10), // Mock data
      verifications: Math.floor(Math.random() * 15) // Mock data
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
      },
      {
        type: 'github_contributor',
        name: 'GitHub Contributor',
        description: 'Require users to contribute to your GitHub repositories',
        parameters: { organization: '', minContributions: 1 },
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
      primary: ['polygonid', 'idos'], // Default primary verification
      secondary: secondaryRules,
      logic: 'AND' // Default to AND logic for social rules
    };
  }
}

export const issuerDashboardService = new IssuerDashboardService();