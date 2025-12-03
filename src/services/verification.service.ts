import { AppDataSource } from '../db/datasource';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { didService } from './did.service';
import { webhookService, WebhookPayload } from './webhook.service';
import { Like } from 'typeorm'; // ADDED

const verificationRepository = AppDataSource.getRepository(Verification);
const userRepository = AppDataSource.getRepository(User);

export class VerificationService {
  // ADDED: Create verification with issuer context
  async createVerificationWithIssuerContext(
    wallet: string,
    provider: string,
    type: VerificationType = VerificationType.PRIMARY_DID,
    issuerId?: string,
    targetAccount?: string,
    sessionId?: string,
    expiresInMinutes: number = 30
  ): Promise<Verification> {
    const metadata: any = {};
    
    // ADDED: Store issuer context in metadata
    if (issuerId) {
      metadata.issuerId = issuerId;
      metadata.verificationContext = 'issuer_specific';
    }
    
    if (targetAccount) {
      metadata.targetAccount = targetAccount;
    }
    
    const verification = verificationRepository.create({
      wallet: wallet.toLowerCase(),
      provider,
      type,
      status: VerificationStatus.PENDING,
      sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    });

    await verificationRepository.save(verification);
    
    const contextInfo = issuerId ? ` for issuer ${issuerId}` : '';
    logger.info(`Created verification session${contextInfo}: ${verification.sessionId} for wallet: ${wallet}, provider: ${provider}`);

    return verification;
  }

  async createVerificationSession(
    wallet: string,
    provider: string,
    type: VerificationType = VerificationType.PRIMARY_DID,
    sessionId?: string,
    expiresInMinutes: number = 30
  ): Promise<Verification> {
    // Use the new method for backward compatibility
    return this.createVerificationWithIssuerContext(
      wallet,
      provider,
      type,
      undefined, // No issuerId
      undefined, // No targetAccount
      sessionId,
      expiresInMinutes
    );
  }

  async getVerificationBySessionId(sessionId: string): Promise<Verification | null> {
    return verificationRepository.findOne({
      where: { sessionId },
      relations: ['user']
    });
  }

  async getVerificationById(verificationId: string): Promise<Verification | null> {
    return verificationRepository.findOne({
      where: { id: verificationId },
      relations: ['user']
    });
  }

  async getActiveVerifications(wallet: string, provider?: string, issuerId?: string): Promise<Verification[]> {
    const query = verificationRepository
      .createQueryBuilder('verification')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() })
      .andWhere('verification.status = :status', { status: VerificationStatus.COMPLETED })
      .andWhere('(verification.expiresAt IS NULL OR verification.expiresAt > :now)', { now: new Date() });

    if (provider) {
      query.andWhere('verification.provider = :provider', { provider });
    }
    
    // ADDED: Filter by issuerId if provided
    if (issuerId) {
      query.andWhere('verification.metadata->>\'issuerId\' = :issuerId', { issuerId });
    }

    return query.getMany();
  }

  async getAllVerifications(wallet: string, options?: {
    provider?: string;
    type?: VerificationType;
    issuerId?: string; // ADDED
    limit?: number;
    offset?: number;
  }): Promise<{ verifications: Verification[]; total: number }> {
    const { provider, type, issuerId, limit = 50, offset = 0 } = options || {};
    
    const query = verificationRepository
      .createQueryBuilder('verification')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() })
      .orderBy('verification.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (provider) {
      query.andWhere('verification.provider = :provider', { provider });
    }

    if (type) {
      query.andWhere('verification.type = :type', { type });
    }
    
    // ADDED: Filter by issuerId if provided
    if (issuerId) {
      query.andWhere('verification.metadata->>\'issuerId\' = :issuerId', { issuerId });
    }

    const [verifications, total] = await query.getManyAndCount();
    
    return { verifications, total };
  }

  async updateVerificationSuccess(
    verificationId: string,
    did: string,
    metadata: any,
    providerVerificationId?: string,
    issuerId?: string // ADDED
  ): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId },
      relations: ['user']
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    // ADDED: Ensure issuerId is preserved in metadata
    const updatedMetadata = {
      ...metadata,
      issuerId: issuerId || metadata?.issuerId
    };

    verification.markCompleted(did, updatedMetadata, providerVerificationId);
    await verificationRepository.save(verification);

    // Update user's DID if this is a primary verification
    if (verification.type === VerificationType.PRIMARY_DID && did) {
      await this.updateUserDID(verification.wallet, did, verification.provider);
    }

    // Send webhook for successful verification
    await this.sendVerificationWebhook(verification, 'verification.completed');

    const contextInfo = issuerId ? ` for issuer ${issuerId}` : '';
    logger.info(`Verification completed successfully${contextInfo}: ${verificationId}, DID: ${did}`);
    return verification;
  }

  async updateVerificationFailure(
    verificationId: string,
    error: string
  ): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId },
      relations: ['user']
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    verification.markFailed(error);
    await verificationRepository.save(verification);

    // Send webhook for failed verification
    await this.sendVerificationWebhook(verification, 'verification.failed');

    logger.warn(`Verification failed: ${verificationId}, error: ${error}`);
    return verification;
  }

  async expireVerification(verificationId: string): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId }
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    verification.status = VerificationStatus.EXPIRED;
    await verificationRepository.save(verification);

    logger.info(`Verification expired: ${verificationId}`);
    return verification;
  }

  private async updateUserDID(wallet: string, did: string, provider: string): Promise<void> {
    let user = await userRepository.findOne({
      where: { wallet: wallet.toLowerCase() }
    });

    if (!user) {
      // Create user if they don't exist (should exist due to auth, but just in case)
      user = userRepository.create({
        wallet: wallet.toLowerCase(),
        did,
        provider
      });
    } else {
      user.did = did;
      user.provider = provider;
    }

    await userRepository.save(user);
    logger.info(`Updated user DID: ${wallet} -> ${did}`);
  }

  private async sendVerificationWebhook(
    verification: Verification, 
    event: string
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      wallet: verification.wallet,
      verificationId: verification.verificationId,
      did: verification.did,
      provider: verification.provider,
      timestamp: new Date().toISOString(),
      metadata: {
        ...verification.metadata,
        verificationType: verification.type,
        sessionId: verification.sessionId,
        completedAt: verification.completedAt,
        issuerId: verification.metadata?.issuerId // ADDED: Include issuerId in webhook
      }
    };

    // For now, send to all registered issuers
    // In production, you'd have issuer-specific webhooks
    const issuers = webhookService.getRegisteredIssuers();
    
    for (const issuerId of issuers) {
      await webhookService.sendWebhook(issuerId, payload);
    }
  }

  async initiateDIDVerification(
    wallet: string,
    provider: string,
    callbackUrl: string,
    issuerId?: string // ADDED
  ): Promise<{ verification: Verification; challenge: any }> {
    // Check if user already has a valid DID verification
    const existingVerifications = await this.getActiveVerifications(wallet, provider, issuerId);
    if (existingVerifications.length > 0) {
      const validVerification = existingVerifications.find(v => v.canBeUsed());
      if (validVerification) {
        const context = issuerId ? ` for issuer ${issuerId}` : '';
        logger.info(`User ${wallet} already has active ${provider} verification${context}`);
        throw new Error(`Already has active ${provider} verification${context}`);
      }
    }

    // Initialize verification with DID provider
    const didResponse = await didService.initVerification(provider, {
      wallet,
      callbackUrl,
      provider,
      issuerId // ADDED: Pass issuerId to DID service
    });

    if (!didResponse.success) {
      throw new Error(`DID provider error: ${didResponse.error}`);
    }

    // Create verification session with issuer context
    const verification = await this.createVerificationWithIssuerContext(
      wallet,
      provider,
      VerificationType.PRIMARY_DID,
      issuerId,
      undefined, // No target account for DID
      didResponse.sessionId
    );

    return {
      verification,
      challenge: {
        qrCode: didResponse.qrCode,
        challengeUrl: didResponse.challengeUrl,
        sessionId: didResponse.sessionId
      }
    };
  }

  async handleDIDVerificationCallback(
    provider: string,
    payload: any,
    sessionId?: string
  ): Promise<Verification> {
    // Find the verification session
    const verification = await this.getVerificationBySessionId(sessionId || payload.sessionId);
    if (!verification) {
      throw new Error('Verification session not found');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new Error('Verification already processed');
    }

    if (verification.isExpired()) {
      verification.status = VerificationStatus.EXPIRED;
      await verificationRepository.save(verification);
      throw new Error('Verification session expired');
    }

    // Verify with DID provider
    const verificationResult = await didService.handleCallback(provider, payload, sessionId);

    if (verificationResult.success && verificationResult.did) {
      // Extract issuerId from verification metadata
      const issuerId = verification.metadata?.issuerId;
      
      return await this.updateVerificationSuccess(
        verification.id,
        verificationResult.did,
        verificationResult.metadata,
        verificationResult.verificationId,
        issuerId // ADDED
      );
    } else {
      return await this.updateVerificationFailure(
        verification.id,
        verificationResult.error || 'Verification failed'
      );
    }
  }

  async getUserVerificationStatus(wallet: string, issuerId?: string): Promise<{
    hasPrimaryDID: boolean;
    primaryDID?: string;
    primaryProvider?: string;
    activeVerifications: Verification[];
    totalVerifications: number;
    issuerSpecific?: {
      issuerId: string;
      completed: number;
      total: number;
    };
  }> {
    const activeVerifications = await this.getActiveVerifications(wallet, undefined, issuerId);
    const { total: totalVerifications } = await this.getAllVerifications(wallet, { 
      limit: 1,
      issuerId 
    });
    
    const primaryDIDVerification = activeVerifications.find(v => 
      v.type === VerificationType.PRIMARY_DID && v.canBeUsed()
    );

    const result = {
      hasPrimaryDID: !!primaryDIDVerification,
      primaryDID: primaryDIDVerification?.did,
      primaryProvider: primaryDIDVerification?.provider,
      activeVerifications,
      totalVerifications
    };

    // ADDED: Include issuer-specific stats if issuerId provided
    if (issuerId) {
      const issuerVerifications = activeVerifications.filter(v => 
        v.metadata?.issuerId === issuerId
      );
      
      return {
        ...result,
        issuerSpecific: {
          issuerId,
          completed: issuerVerifications.length,
          total: issuerVerifications.length // This would be total requirements for issuer
        }
      };
    }

    return result;
  }

  async getVerificationStats(wallet: string, issuerId?: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    expired: number;
    byProvider: Record<string, number>;
    byType: Record<string, number>;
    byIssuer: Record<string, number>; // ADDED
  }> {
    const query = verificationRepository
      .createQueryBuilder('verification')
      .select('verification.status', 'status')
      .addSelect('verification.provider', 'provider')
      .addSelect('verification.type', 'type')
      .addSelect('verification.metadata->>\'issuerId\'', 'issuerId') // ADDED
      .addSelect('COUNT(*)', 'count')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() });

    // ADDED: Filter by issuerId if provided
    if (issuerId) {
      query.andWhere('verification.metadata->>\'issuerId\' = :issuerId', { issuerId });
    }

    query
      .groupBy('verification.status')
      .addGroupBy('verification.provider')
      .addGroupBy('verification.type')
      .addGroupBy('verification.metadata->>\'issuerId\''); // ADDED

    const stats = await query.getRawMany();

    const result = {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      expired: 0,
      byProvider: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byIssuer: {} as Record<string, number> // ADDED
    };

    stats.forEach(stat => {
      const count = parseInt(stat.count);
      result.total += count;

      // Status counts
      switch (stat.status) {
        case VerificationStatus.COMPLETED:
          result.completed += count;
          break;
        case VerificationStatus.FAILED:
          result.failed += count;
          break;
        case VerificationStatus.PENDING:
          result.pending += count;
          break;
        case VerificationStatus.EXPIRED:
          result.expired += count;
          break;
      }

      // Provider counts
      if (stat.provider) {
        result.byProvider[stat.provider] = (result.byProvider[stat.provider] || 0) + count;
      }

      // Type counts
      if (stat.type) {
        result.byType[stat.type] = (result.byType[stat.type] || 0) + count;
      }

      // ADDED: Issuer counts
      if (stat.issuerId) {
        result.byIssuer[stat.issuerId] = (result.byIssuer[stat.issuerId] || 0) + count;
      }
    });

    return result;
  }

  async cleanupExpiredVerifications(): Promise<number> {
    const result = await verificationRepository
      .createQueryBuilder()
      .update(Verification)
      .set({ status: VerificationStatus.EXPIRED })
      .where('status = :status', { status: VerificationStatus.PENDING })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    const affected = result.affected || 0;
    if (affected > 0) {
      logger.info(`Cleaned up ${affected} expired verifications`);
    }

    return affected;
  }

  async revokeVerification(verificationId: string, reason?: string): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId }
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    // Store the original status before revocation
    const originalStatus = verification.status;
    
    verification.status = VerificationStatus.FAILED;
    verification.errorMessage = reason || 'Manually revoked';
    verification.completedAt = new Date();
    
    await verificationRepository.save(verification);

    // Send webhook for revocation
    await this.sendVerificationWebhook(verification, 'verification.revoked');

    logger.info(`Verification revoked: ${verificationId}, reason: ${reason}, original status: ${originalStatus}`);
    return verification;
  }

  // ADDED: New method to get user verifications for a specific issuer
  async getUserVerificationsForIssuer(wallet: string, issuerId: string): Promise<Verification[]> {
    // Use query builder for JSONB query
    return await verificationRepository
      .createQueryBuilder('verification')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() })
      .andWhere('verification.metadata::jsonb @> :metadata', {
        metadata: JSON.stringify({ issuerId })
      })
      .orderBy('verification.createdAt', 'DESC')
      .getMany();
  }

  // ADDED: New method to get issuer-specific verification status
  async getIssuerVerificationStatus(wallet: string, issuerId: string, provider?: string): Promise<{
    issuerId: string;
    provider?: string;
    hasVerification: boolean;
    verification?: Verification;
    status: 'completed' | 'pending' | 'failed' | 'expired' | 'not_started';
    completedAt?: Date;
    details?: any;
  }> {
    const query: any = {
      wallet: wallet.toLowerCase(),
      metadata: Like(`%"issuerId":"${issuerId}"%`)
    };
    
    if (provider) {
      query.provider = provider;
    }

    const verifications = await verificationRepository.find({
      where: query,
      order: { createdAt: 'DESC' },
      take: 1
    });

    if (verifications.length === 0) {
      return {
        issuerId,
        provider,
        hasVerification: false,
        status: 'not_started'
      };
    }

    const verification = verifications[0];
    
    return {
      issuerId,
      provider: verification.provider,
      hasVerification: true,
      verification,
      status: verification.status as 'completed' | 'pending' | 'failed' | 'expired',
      completedAt: verification.completedAt,
      details: verification.metadata
    };
  }
}

// Create and export singleton instance
export const verificationService = new VerificationService();