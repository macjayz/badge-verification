import { AppDataSource } from '../db/datasource';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { didService } from './did.service';
import { webhookService, WebhookPayload } from './webhook.service';

const verificationRepository = AppDataSource.getRepository(Verification);
const userRepository = AppDataSource.getRepository(User);

export class VerificationService {
  async createVerificationSession(
    wallet: string,
    provider: string,
    type: VerificationType = VerificationType.PRIMARY_DID,
    sessionId?: string,
    expiresInMinutes: number = 30
  ): Promise<Verification> {
    const verification = verificationRepository.create({
      wallet: wallet.toLowerCase(),
      provider,
      type,
      status: VerificationStatus.PENDING,
      sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    });

    await verificationRepository.save(verification);
    logger.info(`Created verification session: ${verification.sessionId} for wallet: ${wallet}, provider: ${provider}`);

    return verification;
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

  async getActiveVerifications(wallet: string, provider?: string): Promise<Verification[]> {
    const query = verificationRepository
      .createQueryBuilder('verification')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() })
      .andWhere('verification.status = :status', { status: VerificationStatus.COMPLETED })
      .andWhere('(verification.expiresAt IS NULL OR verification.expiresAt > :now)', { now: new Date() });

    if (provider) {
      query.andWhere('verification.provider = :provider', { provider });
    }

    return query.getMany();
  }

  async getAllVerifications(wallet: string, options?: {
    provider?: string;
    type?: VerificationType;
    limit?: number;
    offset?: number;
  }): Promise<{ verifications: Verification[]; total: number }> {
    const { provider, type, limit = 50, offset = 0 } = options || {};
    
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

    const [verifications, total] = await query.getManyAndCount();
    
    return { verifications, total };
  }

  async updateVerificationSuccess(
    verificationId: string,
    did: string,
    metadata: any,
    providerVerificationId?: string
  ): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId },
      relations: ['user']
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    verification.markCompleted(did, metadata, providerVerificationId);
    await verificationRepository.save(verification);

    // Update user's DID if this is a primary verification
    if (verification.type === VerificationType.PRIMARY_DID && did) {
      await this.updateUserDID(verification.wallet, did, verification.provider);
    }

    // Send webhook for successful verification
    await this.sendVerificationWebhook(verification, 'verification.completed');

    logger.info(`Verification completed successfully: ${verificationId}, DID: ${did}`);
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
        completedAt: verification.completedAt
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
    callbackUrl: string
  ): Promise<{ verification: Verification; challenge: any }> {
    // Check if user already has a valid DID verification
    const existingVerifications = await this.getActiveVerifications(wallet, provider);
    if (existingVerifications.length > 0) {
      const validVerification = existingVerifications.find(v => v.canBeUsed());
      if (validVerification) {
        logger.info(`User ${wallet} already has active ${provider} verification`);
        throw new Error(`Already has active ${provider} verification`);
      }
    }

    // Initialize verification with DID provider
    const didResponse = await didService.initVerification(provider, {
      wallet,
      callbackUrl,
      provider
    });

    if (!didResponse.success) {
      throw new Error(`DID provider error: ${didResponse.error}`);
    }

    // Create verification session
    const verification = await this.createVerificationSession(
      wallet,
      provider,
      VerificationType.PRIMARY_DID,
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
      return await this.updateVerificationSuccess(
        verification.id,
        verificationResult.did,
        verificationResult.metadata,
        verificationResult.verificationId
      );
    } else {
      return await this.updateVerificationFailure(
        verification.id,
        verificationResult.error || 'Verification failed'
      );
    }
  }

  async getUserVerificationStatus(wallet: string): Promise<{
    hasPrimaryDID: boolean;
    primaryDID?: string;
    primaryProvider?: string;
    activeVerifications: Verification[];
    totalVerifications: number;
  }> {
    const activeVerifications = await this.getActiveVerifications(wallet);
    const { total: totalVerifications } = await this.getAllVerifications(wallet, { limit: 1 });
    const primaryDIDVerification = activeVerifications.find(v => 
      v.type === VerificationType.PRIMARY_DID && v.canBeUsed()
    );

    return {
      hasPrimaryDID: !!primaryDIDVerification,
      primaryDID: primaryDIDVerification?.did,
      primaryProvider: primaryDIDVerification?.provider,
      activeVerifications,
      totalVerifications
    };
  }

  async getVerificationStats(wallet: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    expired: number;
    byProvider: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const stats = await verificationRepository
      .createQueryBuilder('verification')
      .select('verification.status', 'status')
      .addSelect('verification.provider', 'provider')
      .addSelect('verification.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('verification.wallet = :wallet', { wallet: wallet.toLowerCase() })
      .groupBy('verification.status')
      .addGroupBy('verification.provider')
      .addGroupBy('verification.type')
      .getRawMany();

    const result = {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      expired: 0,
      byProvider: {} as Record<string, number>,
      byType: {} as Record<string, number>
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
}

// Create and export singleton instance
export const verificationService = new VerificationService();