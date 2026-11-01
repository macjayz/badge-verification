import { AppDataSource } from '../db/datasource';
import { UserSocialConnection } from '../entities/UserSocialConnection';
import { Verification, VerificationStatus } from '../entities/Verification';
import { issuerSocialService } from './issuer-social.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const socialConnectionRepository = AppDataSource.getRepository(UserSocialConnection);

export interface TwitterOAuthResponse {
  authUrl: string;
  state: string;
  codeVerifier: string;
}

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

interface TwitterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface TwitterUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
  };
}

/** Older rows stored metadata as a JSON string inside the jsonb column. */
function parseMetadata(metadata: unknown): any {
  if (typeof metadata !== 'string') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return undefined;
  }
}

export class TwitterService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID || '';
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET || '';
    this.redirectUri = process.env.TWITTER_REDIRECT_URI ||
                      'http://localhost:3001/api/verify/twitter/callback';
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Initiate Twitter OAuth flow
   */
  async initiateOAuth(wallet: string, _metadata?: any): Promise<TwitterOAuthResponse> {
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'users.read tweet.read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

    logger.info(`Initiated Twitter OAuth for wallet: ${wallet}, state: ${state}`);

    return {
      authUrl,
      state,
      codeVerifier
    };
  }

  /**
   * Handle Twitter OAuth callback
   */
  async handleCallback(wallet: string, code: string, state: string, codeVerifier: string, issuerId?: string): Promise<TwitterUser> {
    try {
      logger.debug('=== TWITTER OAUTH DEBUG ===');

      // Create Basic Auth header for OAuth 2.0
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams({
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      logger.debug('Token response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.debug('Token response error:', errorText);
        throw new Error(`Twitter OAuth token exchange failed: ${tokenResponse.status} - ${errorText}`);
      }

      const tokenData = await tokenResponse.json() as TwitterTokenResponse;
      const accessToken = tokenData.access_token;

      // Get Twitter user info
      const userResponse = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch Twitter user info');
      }

      const userData = await userResponse.json() as TwitterUserResponse;
      const twitterUser: TwitterUser = {
        id: userData.data.id,
        username: userData.data.username,
        name: userData.data.name,
      };

      // Save social connection
      await this.saveSocialConnection(wallet, twitterUser, accessToken, issuerId);

      // Create verification record
      await this.createTwitterVerification(wallet, twitterUser, issuerId);

      logger.info(`Twitter OAuth completed for wallet: ${wallet}, Twitter user: @${twitterUser.username}`);
      return twitterUser;

    } catch (error) {
      logger.error(`Twitter OAuth callback error for wallet ${wallet}:`, error);
      throw new Error(`Twitter authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Twitter verification record
   */
  private async createTwitterVerification(wallet: string, twitterUser: TwitterUser, issuerId?: string): Promise<void> {
    try {
      logger.debug('=== TWITTER VERIFICATION START ===');
      logger.debug(`Issuer context: ${issuerId || 'None (global verification)'}`);

      const verificationRepository = AppDataSource.getRepository(Verification);

      // The account the user must follow is the issuer's; a global sign-in only proves the connection.
      const issuerAccount = issuerId ? await issuerSocialService.getTwitterAccount(issuerId) : null;
      const requiredAccounts = issuerAccount ? [issuerAccount] : [];

      const connection = await socialConnectionRepository.findOne({
        where: {
          wallet: wallet.toLowerCase(),
          platform: 'twitter',
          isActive: true
        }
      });

      if (!connection) {
        logger.debug('No active Twitter connection found');
        throw new Error('Twitter connection not found');
      }

      logger.debug('Twitter connection found - User:', connection.platformHandle);

      const verificationStatus = VerificationStatus.COMPLETED;
      const verificationDetails: any = {
        twitterUsername: twitterUser.username,
        twitterId: twitterUser.id,
        connectedAt: new Date().toISOString(),
        followChecks: {},
        requiredAccounts
      };
      if (issuerId) {
        verificationDetails.issuerId = issuerId;
      }

      for (const account of requiredAccounts) {
        try {
          const targetUser = await this.getUserByUsername(account, connection.accessToken!);
          if (!targetUser) {
            verificationDetails.followChecks[account] = { follows: false, error: 'User not found' };
            continue;
          }

          const follows = await this.simpleFollowCheck(
            connection.platformUserId,
            targetUser.id,
            process.env.TWITTER_BEARER_TOKEN || ''
          );
          verificationDetails.followChecks[account] = { follows, targetUserId: targetUser.id };
        } catch (error: any) {
          // X's lower API tiers do not expose follow lookups at all. Record that the check could
          // not run rather than guessing either way; verifyFollow decides what that means.
          const unavailable = /Standalone App|453|subset of X API/.test(error.message);
          verificationDetails.followChecks[account] = unavailable
            ? { follows: false, unavailable: true, error: 'Follow lookups are not available on this X API plan' }
            : { follows: false, error: error.message };
        }
      }

      const followsAll =
        requiredAccounts.length > 0 &&
        requiredAccounts.every(account => verificationDetails.followChecks[account]?.follows === true);
      const verificationType = followsAll ? 'follow_verified' : 'connection_only';
      if (followsAll) {
        verificationDetails.verifiedAt = new Date().toISOString();
      }

      logger.debug('Twitter verification result', { wallet, issuerId, verificationType, followChecks: verificationDetails.followChecks });

      // One record per wallet and issuer (or one global record when there is no issuer).
      const existing = await verificationRepository.find({ where: { wallet, provider: 'twitter_follow' } });
      let verification = existing.find(v => (parseMetadata(v.metadata)?.issuerId ?? null) === (issuerId ?? null));

      if (verification) {
        verification.status = verificationStatus;
        verification.type = verificationType as any;
        verification.did = `did:twitter:${twitterUser.id}`;
        verification.metadata = verificationDetails;
        verification.completedAt = new Date();
      } else {
        verification = verificationRepository.create({
          wallet,
          provider: 'twitter_follow',
          type: verificationType as any,
          status: verificationStatus,
          did: `did:twitter:${twitterUser.id}`,
          metadata: verificationDetails,
          verificationId: `twitter_${twitterUser.id}${issuerId ? `_issuer_${issuerId}` : ''}`,
          completedAt: new Date()
        });
      }

      await verificationRepository.save(verification);
      logger.debug(`Verification saved: ${verificationStatus} (${verificationType})${issuerId ? ` for issuer ${issuerId}` : ''}`);

    } catch (error: any) {
      logger.debug('CRITICAL ERROR in verification:', error.message);
    }
  }

  /**
   * Simple follow check using Bearer Token
   */
  private async simpleFollowCheck(sourceUserId: string, targetUserId: string, bearerToken: string): Promise<boolean> {
    try {
      const url = `https://api.twitter.com/1.1/friendships/show.json?source_id=${sourceUserId}&target_id=${targetUserId}`;

      logger.debug(`API call: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.debug(`API response: ${response.status}`);

      if (response.ok) {
        const data = await response.json() as any;
        const follows = data?.relationship?.source?.following || false;
        return follows;
      } else {
        const errorText = await response.text();
        logger.debug(`API error: ${errorText}`);

        // Check for Standalone App errors
        const errorData = JSON.parse(errorText);
        if (errorData.errors?.[0]?.code === 453 ||
            errorText.includes('subset of X API') ||
            errorText.includes('Standalone App')) {

          // Throw specific error that will trigger bypass
          throw new Error('Standalone App cannot access friendships API');
        }

        throw new Error(`API error: ${response.status}`);
      }

    } catch (error: any) {
      logger.debug(`API call failed:`, error.message);
      throw error; // Re-throw to trigger bypass in calling method
    }
  }

  /**
   * Get Twitter user by username
   */
  private async getUserByUsername(username: string, accessToken: string): Promise<{ id: string; username: string } | null> {
    try {
      logger.debug(`Fetching user ID for @${username}...`);

      const response = await fetch(
        `https://api.twitter.com/2/users/by/username/${username}?user.fields=id,username,name`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
        logger.debug(`⏳ Waiting ${waitTime/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.getUserByUsername(username, accessToken);
      }

      if (!response.ok) {
        if (response.status === 404) {
          logger.debug(`User @${username} not found`);
          return null;
        }
        const errorText = await response.text();
        throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as TwitterUserResponse;
      logger.debug(`Found user @${username}: ID ${data.data.id}`);
      return data.data;
    } catch (error: any) {
      logger.error(`Error getting user @${username}:`, error.message);
      throw error;
    }
  }

  /**
   * Save social connection
   */
  private async saveSocialConnection(
    wallet: string,
    twitterUser: TwitterUser,
    accessToken: string,
    issuerId?: string
  ): Promise<void> {
    let connection = await socialConnectionRepository.findOne({
      where: {
        wallet: wallet.toLowerCase(),
        platform: 'twitter'
      }
    });

    // Prepare profileData with issuer context if provided
    const profileData = issuerId ? {
      issuerId,
      twitterId: twitterUser.id,
      username: twitterUser.username,
      name: twitterUser.name
    } : {
      twitterId: twitterUser.id,
      username: twitterUser.username,
      name: twitterUser.name
    };

    if (connection) {
      connection.platformUserId = twitterUser.id;
      connection.platformHandle = twitterUser.username;
      connection.accessToken = accessToken;
      connection.isActive = true;
      connection.connectedAt = new Date();
      connection.profileData = profileData;
    } else {
      connection = socialConnectionRepository.create({
        wallet: wallet.toLowerCase(),
        platform: 'twitter',
        platformUserId: twitterUser.id,
        platformHandle: twitterUser.username,
        accessToken,
        profileData,
        isActive: true,
        connectedAt: new Date()
      });
    }

    await socialConnectionRepository.save(connection);
    logger.debug(`Saved Twitter connection: @${twitterUser.username}${issuerId ? ` for issuer ${issuerId}` : ''}`);
  }

  /**
   * Get user's Twitter connection status
   */
  async getConnectionStatus(wallet: string, issuerId?: string): Promise<{ connected: boolean; username?: string }> {
    const connections = await socialConnectionRepository.find({
      where: {
        wallet: wallet.toLowerCase(),
        platform: 'twitter',
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
   * Disconnect Twitter account
   */
  async disconnect(wallet: string, issuerId?: string): Promise<void> {
    const connections = await socialConnectionRepository.find({
      where: {
        wallet: wallet.toLowerCase(),
        platform: 'twitter',
        isActive: true
      }
    });

    let disconnectedCount = 0;

    for (const connection of connections) {
      // If issuerId specified, only disconnect connections for that issuer
      if (issuerId) {
        if (connection.profileData) {
          try {
            if (connection.profileData.issuerId === issuerId) {
              connection.isActive = false;
              connection.accessToken = undefined;
              await socialConnectionRepository.save(connection);
              disconnectedCount++;
            }
          } catch {
            // Skip if profileData is invalid
          }
        }
      } else {
        // Disconnect all Twitter connections
        connection.isActive = false;
        connection.accessToken = undefined;
        await socialConnectionRepository.save(connection);
        disconnectedCount++;
      }
    }

    logger.debug(`Disconnected ${disconnectedCount} Twitter connection(s) for wallet: ${wallet}${issuerId ? ` (issuer: ${issuerId})` : ''}`);
  }

  /**
   * Verify Twitter follow
   */
  async verifyFollow(wallet: string, targetUsername: string, issuerId?: string): Promise<{ verified: boolean; details: any }> {
    try {
      const connection = await this.getConnectionStatus(wallet, issuerId);

      if (!connection.connected) {
        return {
          verified: false,
          details: {
            error: 'Twitter account not connected',
            connected: false,
            issuerId
          }
        };
      }

      const target = targetUsername.replace(/^@/, '');
      const verifications = await AppDataSource.getRepository(Verification).find({
        where: { wallet: wallet.toLowerCase(), provider: 'twitter_follow' },
        order: { updatedAt: 'DESC' }
      });
      const check = verifications
        .map(v => parseMetadata(v.metadata)?.followChecks?.[target])
        .find(result => result !== undefined);

      if (check?.follows === true) {
        return {
          verified: true,
          details: { connected: true, userTwitterHandle: connection.username, targetUsername: target, issuerId, checkedAt: new Date().toISOString() }
        };
      }

      // Opt-in for deployments on an X API plan without follow lookups: a connected account counts.
      if (process.env.TWITTER_ACCEPT_CONNECTION_AS_FOLLOW === 'true') {
        return {
          verified: true,
          details: {
            connected: true,
            userTwitterHandle: connection.username,
            targetUsername: target,
            issuerId,
            mode: 'connection_only',
            checkedAt: new Date().toISOString()
          }
        };
      }

      return {
        verified: false,
        details: {
          connected: true,
          userTwitterHandle: connection.username,
          targetUsername: target,
          issuerId,
          error: check?.unavailable
            ? 'Follow lookups are not available on this X API plan'
            : `@${connection.username} does not follow @${target}`,
          requiredAction: `Follow @${target} on X, then reconnect your account`,
          checkedAt: new Date().toISOString()
        }
      };

    } catch (error: any) {
      logger.error('Twitter follow verification error:', error);
      return {
        verified: false,
        details: {
          error: error.message,
          connected: false,
          issuerId
        }
      };
    }
  }
}

export const twitterService = new TwitterService();