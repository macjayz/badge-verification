// src/services/discord.service.ts
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

  async initiateOAuth(wallet: string): Promise<DiscordOAuthResponse> {
    const state = crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state: state
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    logger.info(`Initiated Discord OAuth for wallet: ${wallet}, state: ${state}`);

    return {
      authUrl,
      state
    };
  }

// Then update the handleCallback method:
async handleCallback(wallet: string, code: string, state: string): Promise<DiscordUser> {
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

        // Save social connection
        await this.saveSocialConnection(wallet, discordUser, accessToken);

        // ✅ ADD THIS: Create verification record
        await this.createDiscordVerification(wallet, discordUser);

        logger.info(`Discord OAuth completed for wallet: ${wallet}, Discord user: ${discordUser.username}#${discordUser.discriminator}`);
        return discordUser;

    } catch (error) {
        logger.error(`Discord OAuth callback error for wallet ${wallet}:`, error);
        throw new Error(`Discord authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ✅ ADD THIS METHOD to create verification record
private async createDiscordVerification(wallet: string, discordUser: DiscordUser): Promise<void> {
    try {
        const verificationRepository = AppDataSource.getRepository(Verification);
        
        // Check if verification already exists
        let verification = await verificationRepository.findOne({
            where: { 
                wallet: wallet,
                provider: 'discord_member'
            }
        });

        if (verification) {
            // Update existing verification using the entity's helper method
            verification.markCompleted(
                `did:discord:${discordUser.id}`,
                { 
                    discordUsername: `${discordUser.username}#${discordUser.discriminator}`,
                    discordId: discordUser.id,
                    connectedAt: new Date().toISOString()
                },
                `discord_${discordUser.id}`
            );
        } else {
            // Create new verification
            verification = verificationRepository.create({
                wallet: wallet,
                provider: 'discord_member',
                type: VerificationType.SECONDARY,
                status: VerificationStatus.COMPLETED,
                did: `did:discord:${discordUser.id}`,
                metadata: {
                    discordUsername: `${discordUser.username}#${discordUser.discriminator}`,
                    discordId: discordUser.id,
                    connectedAt: new Date().toISOString()
                },
                verificationId: `discord_${discordUser.id}`,
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        await verificationRepository.save(verification);
        logger.info(`Created Discord verification for wallet: ${wallet}`);
        
    } catch (error) {
        logger.error('Failed to create Discord verification record:', error);
        // Don't throw error here - we don't want to fail the whole OAuth flow
    }
}
  

  private async saveSocialConnection(
    wallet: string, 
    discordUser: DiscordUser, 
    accessToken: string
  ): Promise<void> {
    let connection = await socialConnectionRepository.findOne({
      where: { 
        wallet: wallet.toLowerCase(), 
        platform: 'discord' 
      }
    });

    const username = `${discordUser.username}#${discordUser.discriminator}`;

    if (connection) {
      connection.platformUserId = discordUser.id;
      connection.platformHandle = username;
      connection.accessToken = accessToken;
      connection.isActive = true;
      connection.connectedAt = new Date();
    } else {
      connection = socialConnectionRepository.create({
        wallet: wallet.toLowerCase(),
        platform: 'discord',
        platformUserId: discordUser.id,
        platformHandle: username,
        accessToken,
        isActive: true,
        connectedAt: new Date()
      });
    }

    await socialConnectionRepository.save(connection);
    logger.info(`Saved Discord connection for wallet: ${wallet}, Discord: ${username}`);
  }

  async getConnectionStatus(wallet: string): Promise<{ connected: boolean; username?: string }> {
    const connection = await socialConnectionRepository.findOne({
      where: { 
        wallet: wallet.toLowerCase(), 
        platform: 'discord',
        isActive: true 
      }
    });

    return {
      connected: !!connection,
      username: connection?.platformHandle || undefined
    };
  }

  async verifyServerMembership(wallet: string, serverId: string): Promise<{ verified: boolean; details: any }> {
    // Implementation for checking if user is in a specific Discord server
    // This requires the guilds.members.read scope and proper bot permissions
    return {
      verified: Math.random() > 0.3, // Mock for now
      details: { mock: true, serverId }
    };
  }
}

export const discordService = new DiscordService();