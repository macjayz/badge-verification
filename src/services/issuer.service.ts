import { AppDataSource } from '../db/datasource';
import { Issuer } from '../entities/Issuer';
import { BadgeType, BadgeRules } from '../entities/BadgeType';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const issuerRepository = AppDataSource.getRepository(Issuer);
const badgeTypeRepository = AppDataSource.getRepository(BadgeType);

export class IssuerService {
  private generateApiKey(): string {
    return `badge_${crypto.randomBytes(32).toString('hex')}`;
  }

  async createIssuer(
    name: string,
    wallet: string,
    description?: string,
    website?: string,
    contactEmail?: string
  ): Promise<{ issuer: Issuer; apiKey: string }> {
    // Check if issuer already exists for this wallet
    const existingIssuer = await issuerRepository.findOne({
      where: { wallet: wallet.toLowerCase() }
    });

    if (existingIssuer) {
      throw new Error('Issuer already exists for this wallet');
    }

    const apiKey = this.generateApiKey();
    
    const issuer = issuerRepository.create({
      name,
      wallet: wallet.toLowerCase(),
      apiKey,
      description,
      website,
      contactEmail
    });

    await issuerRepository.save(issuer);
    
    logger.info(`Created new issuer: ${name} (${wallet})`);
    
    return { issuer, apiKey };
  }

  async getIssuerByApiKey(apiKey: string): Promise<Issuer | null> {
    return issuerRepository.findOne({
      where: { apiKey, isActive: true },
      relations: ['badgeTypes']
    });
  }

  async getIssuerByWallet(wallet: string): Promise<Issuer | null> {
    return issuerRepository.findOne({
      where: { wallet: wallet.toLowerCase() },
      relations: ['badgeTypes']
    });
  }

  async createBadgeType(
    issuerId: string,
    key: string,
    name: string,
    rules: BadgeRules,
    description?: string,
    imageUrl?: string,
    metadataIpfs?: string,
    isGlobal: boolean = false
  ): Promise<BadgeType> {
    const issuer = await issuerRepository.findOne({
      where: { id: issuerId }
    });

    if (!issuer) {
      throw new Error('Issuer not found');
    }

    // Check if badge key already exists for this issuer
    const existingBadge = await badgeTypeRepository.findOne({
      where: { key, issuer: { id: issuerId } }
    });

    if (existingBadge) {
      throw new Error('Badge type with this key already exists for issuer');
    }

    const badgeType = badgeTypeRepository.create({
      key,
      name,
      description,
      imageUrl,
      rules,
      metadataIpfs,
      isGlobal,
      issuer
    });

    await badgeTypeRepository.save(badgeType);
    
    logger.info(`Created badge type: ${name} (${key}) for issuer: ${issuer.name}`);
    
    return badgeType;
  }

  async getIssuerBadgeTypes(issuerId: string): Promise<BadgeType[]> {
    return badgeTypeRepository.find({
      where: { issuer: { id: issuerId } },
      order: { createdAt: 'DESC' }
    });
  }

  async getBadgeTypeByKey(key: string): Promise<BadgeType | null> {
    return badgeTypeRepository.findOne({
      where: { key },
      relations: ['issuer']
    });
  }

  async getAllBadgeTypes(): Promise<BadgeType[]> {
    return badgeTypeRepository.find({
      relations: ['issuer'],
      order: { createdAt: 'DESC' }
    });
  }

  async updateBadgeType(
    badgeTypeId: string,
    updates: Partial<{
      name: string;
      description: string;
      imageUrl: string;
      rules: BadgeRules;
      metadataIpfs: string;
      isActive: boolean;
    }>
  ): Promise<BadgeType> {
    const badgeType = await badgeTypeRepository.findOne({
      where: { id: badgeTypeId }
    });

    if (!badgeType) {
      throw new Error('Badge type not found');
    }

    Object.assign(badgeType, updates);
    await badgeTypeRepository.save(badgeType);

    logger.info(`Updated badge type: ${badgeType.name} (${badgeType.key})`);
    
    return badgeType;
  }

  async rotateApiKey(issuerId: string): Promise<{ issuer: Issuer; newApiKey: string }> {
    const issuer = await issuerRepository.findOne({
      where: { id: issuerId }
    });

    if (!issuer) {
      throw new Error('Issuer not found');
    }

    const newApiKey = this.generateApiKey();
    issuer.apiKey = newApiKey;
    await issuerRepository.save(issuer);

    logger.info(`Rotated API key for issuer: ${issuer.name}`);
    
    return { issuer, newApiKey };
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    const issuer = await this.getIssuerByApiKey(apiKey);
    return !!issuer;
  }
}

export const issuerService = new IssuerService();
