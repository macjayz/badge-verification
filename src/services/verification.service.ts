import { AppDataSource } from '../db/datasource';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { didService } from './did.service';

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

  async updateVerificationSuccess(
    verificationId: string,
    did: string,
    metadata: any,
    providerVerificationId?: string
  ): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId }
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

    logger.info(`Verification completed successfully: ${verificationId}, DID: ${did}`);
    return verification;
  }

  async updateVerificationFailure(
    verificationId: string,
    error: string
  ): Promise<Verification> {
    const verification = await verificationRepository.findOne({
      where: { id: verificationId }
    });

    if (!verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    verification.markFailed(error);
    await verificationRepository.save(verification);

    logger.warn(`Verification failed: ${verificationId}, error: ${error}`);
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
    verifications: Verification[];
  }> {
    const verifications = await this.getActiveVerifications(wallet);
    const primaryVerifications = verifications.filter(v => v.type === VerificationType.PRIMARY_DID);
    const primaryDIDVerification = primaryVerifications.find(v => v.canBeUsed());

    return {
      hasPrimaryDID: !!primaryDIDVerification,
      primaryDID: primaryDIDVerification?.did,
      primaryProvider: primaryDIDVerification?.provider,
      verifications
    };
  }
}

// Create and export singleton instance
export const verificationService = new VerificationService();