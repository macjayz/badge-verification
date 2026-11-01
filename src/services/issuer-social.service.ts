import { AppDataSource } from '../db/datasource';
import { IssuerProfile } from '../entities/IssuerProfile';
import { ProjectSocialRules } from '../entities/ProjectSocialRules';

const issuerProfileRepository = AppDataSource.getRepository(IssuerProfile);
const socialRulesRepository = AppDataSource.getRepository(ProjectSocialRules);

/**
 * Looks up what an issuer asks users to do on each platform: an active social rule
 * if the issuer configured one, otherwise the handle or server on their profile.
 */
export class IssuerSocialService {
  async getTwitterAccount(issuerId: string): Promise<string | null> {
    const rule = await this.activeRule(issuerId, 'twitter_follow');
    if (rule?.parameters?.account) return String(rule.parameters.account).replace(/^@/, '');

    const profile = await issuerProfileRepository.findOne({ where: { issuerId } });
    return profile?.twitterHandle?.replace(/^@/, '') || null;
  }

  async getDiscordServer(issuerId: string): Promise<{ serverId: string; serverName?: string } | null> {
    const rule = await this.activeRule(issuerId, 'discord_member');
    if (rule?.parameters?.serverId) {
      return { serverId: String(rule.parameters.serverId), serverName: rule.parameters.serverName };
    }

    const profile = await issuerProfileRepository.findOne({ where: { issuerId } });
    if (!profile?.discordServerId) return null;
    return { serverId: profile.discordServerId, serverName: profile.discordServerName || undefined };
  }

  private activeRule(issuerId: string, ruleType: ProjectSocialRules['ruleType']) {
    return socialRulesRepository.findOne({
      where: { issuerId, ruleType, isActive: true },
      order: { priority: 'DESC' }
    });
  }
}

export const issuerSocialService = new IssuerSocialService();
