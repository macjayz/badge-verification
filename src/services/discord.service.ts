import { AppDataSource } from '../db/datasource';
import { UserSocialConnection } from '../entities/UserSocialConnection';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const socialConnectionRepository = AppDataSource.getRepository(UserSocialConnection);

interface DiscordTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
  }

  interface DiscordUserResponse {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
    global_name?: string;
  }

export interface DiscordOAuthResponse {
  authUrl: string;
  state: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
}

export class DiscordService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private botToken?: string;

  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID || 'dev_client_id';
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET || 'dev_client_secret';
    this.redirectUri = process.env.DISCORD_REDIRECT_URI ||
                      'http://localhost:3001/api/verify/discord/callback';
    this.botToken = process.env.DISCORD_BOT_TOKEN;
  }

  /**
   * Initiate Discord OAuth flow
   */
  async initiateOAuth(wallet: string, metadata?: any): Promise<DiscordOAuthResponse> {
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state: state
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    logger.info(`Initiated Discord OAuth for wallet: ${wallet}, state: ${state}${metadata?.issuerId ? `, issuer: ${metadata.issuerId}` : ''}`);

    return {
      authUrl,
      state
    };
  }

  /**
   * Handle Discord OAuth callback
   */
  async handleCallback(wallet: string, code: string, state: string, issuerId?: string): Promise<DiscordUser> {
    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Discord OAuth token exchange failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json() as DiscordTokenResponse;
        const accessToken = tokenData.access_token;

        // Get Discord user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch Discord user info');
        }

        const userData = await userResponse.json() as DiscordUserResponse;
        const discordUser: DiscordUser = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar,
        };

        // Save social connection with issuer context
        await this.saveSocialConnection(wallet, discordUser, accessToken, issuerId);

        // Create verification record with issuer context
        await this.createDiscordVerification(wallet, discordUser, issuerId);

        logger.info(`Discord OAuth completed for wallet: ${wallet}, Discord user: ${discordUser.username}#${discordUser.discriminator}${issuerId ? `, issuer: ${issuerId}` : ''}`);
        return discordUser;

    } catch (error) {
        logger.error(`Discord OAuth callback error for wallet ${wallet}:`, error);
        throw new Error(`Discord authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

  /**
   * Create Discord verification record
   */
  private async createDiscordVerification(wallet: string, discordUser: DiscordUser, issuerId?: string): Promise<void> {
    try {
        const verificationRepository = AppDataSource.getRepository(Verification);

        // Check if verification already exists
        let verification = await verificationRepository.findOne({
            where: {
                wallet: wallet,
                provider: 'discord_member'
            }
        });

        // Prepare verification metadata with issuer context
        const verificationMetadata: any = {
            discordUsername: `${discordUser.username}#${discordUser.discriminator}`,
            discordId: discordUser.id,
            connectedAt: new Date().toISOString()
        };

        // Add issuer context if provided
        if (issuerId) {
            verificationMetadata.issuerId = issuerId;
        }

        if (verification) {
            // Update existing verification
            verification.status = VerificationStatus.COMPLETED;
            verification.type = VerificationType.SECONDARY;
            verification.did = `did:discord:${discordUser.id}`;
            verification.metadata = verificationMetadata;
            verification.verificationId = `discord_${discordUser.id}${issuerId ? `_issuer_${issuerId}` : ''}`;
            verification.completedAt = new Date();
            verification.updatedAt = new Date();
        } else {
            // Create new verification
            verification = verificationRepository.create({
                wallet: wallet,
                provider: 'discord_member',
                type: VerificationType.SECONDARY,
                status: VerificationStatus.COMPLETED,
                did: `did:discord:${discordUser.id}`,
                metadata: verificationMetadata,
                verificationId: `discord_${discordUser.id}${issuerId ? `_issuer_${issuerId}` : ''}`,
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        await verificationRepository.save(verification);
        logger.info(`Created Discord verification for wallet: ${wallet}${issuerId ? ` (issuer: ${issuerId})` : ''}`);

    } catch (error) {
        logger.error('Failed to create Discord verification record:', error);
        // Don't throw error here - we don't want to fail the whole OAuth flow
    }
}

  /**
   * Save social connection
   */
  private async saveSocialConnection(
    wallet: string,
    discordUser: DiscordUser,
    accessToken: string,
    issuerId?: string
  ): Promise<void> {
    let connection = await socialConnectionRepository.findOne({
      where: {
        wallet: wallet.toLowerCase(),
        platform: 'discord'
      }
    });

    const username = `${discordUser.username}#${discordUser.discriminator}`;

    // Prepare profileData with issuer context if provided
    const profileData = issuerId ? {
      issuerId,
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar
    } : {
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar
    };

    if (connection) {
      connection.platformUserId = discordUser.id;
      connection.platformHandle = username;
      connection.accessToken = accessToken;
      connection.profileData = profileData;
      connection.isActive = true;
      connection.connectedAt = new Date();
    } else {
      connection = socialConnectionRepository.create({
        wallet: wallet.toLowerCase(),
        platform: 'discord',
        platformUserId: discordUser.id,
        platformHandle: username,
        accessToken,
        profileData,
        isActive: true,
        connectedAt: new Date()
      });
    }

    await socialConnectionRepository.save(connection);
    logger.info(`Saved Discord connection for wallet: ${wallet}, Discord: ${username}${issuerId ? ` (issuer: ${issuerId})` : ''}`);
  }

  /**
   * Get Discord connection status
   */
  async getConnectionStatus(wallet: string, issuerId?: string): Promise<{ connected: boolean; username?: string }> {
    const connections = await socialConnectionRepository.find({
      where: {
        wallet: wallet.toLowerCase(),
        platform: 'discord',
        isActive: true
      }
    });

    // If issuerId specified, filter connections for that issuer
    if (issuerId) {
      const issuerConnections = connections.filter(conn => {
        if (!conn.profileData) return false;
        try {
          return conn.profileData.issuerId === issuerId;
        } catch {
          return false;
        }
      });

      if (issuerConnections.length > 0) {
        return {
          connected: true,
          username: issuerConnections[0].platformHandle
        };
      }
      return { connected: false };
    }

    // Return any connection if no issuer filter
    const connection = connections[0];
    return {
      connected: !!connection,
      username: connection?.platformHandle || undefined
    };
  }

  /**
   * Checks membership against the guilds the user granted through OAuth (`guilds` scope).
   */
  async verifyServerMembership(wallet: string, serverId: string, issuerId?: string): Promise<{ verified: boolean; details: any }> {
    const connections = await socialConnectionRepository.find({
      where: { wallet: wallet.toLowerCase(), platform: 'discord', isActive: true }
    });
    const connection = issuerId
      ? connections.find(conn => conn.profileData?.issuerId === issuerId)
      : connections[0];

    if (!connection?.accessToken) {
      return {
        verified: false,
        details: { error: 'Discord account not connected', connected: false, serverId, issuerId }
      };
    }

    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${connection.accessToken}` }
    });
    if (response.status === 401) {
      return {
        verified: false,
        details: { error: 'Discord authorization expired, reconnect Discord', connected: false, serverId, issuerId }
      };
    }
    if (!response.ok) {
      logger.warn('Discord guild lookup failed', { status: response.status, serverId });
      return {
        verified: false,
        details: { error: 'Discord is unavailable, try again later', apiError: true, serverId, issuerId }
      };
    }

    const guilds = (await response.json()) as Array<{ id: string; name: string }>;
    const guild = guilds.find(g => g.id === serverId);
    return {
      verified: !!guild,
      details: {
        serverId,
        serverName: guild?.name,
        issuerId,
        checkedAt: new Date().toISOString()
      }
    };
  }
}

export const discordService = new DiscordService();