// src/services/twitter.service.ts
import { AppDataSource } from '../db/datasource';
import { UserSocialConnection } from '../entities/UserSocialConnection';
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

interface TwitterFollowingResponse {
  data?: Array<{
    id: string;
    name: string;
    username: string;
  }>;
  meta: {
    result_count: number;
    next_token?: string;
  };
}

export class TwitterService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private isDevelopmentMode: boolean;

  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID || 'dev_client_id';
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET || 'dev_client_secret';
    this.redirectUri = process.env.TWITTER_REDIRECT_URI || 
                      'http://localhost:3001/api/verify/twitter/callback';
    this.isDevelopmentMode = !process.env.TWITTER_CLIENT_ID || 
                            process.env.TWITTER_CLIENT_ID === 'dev_client_id';
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
  async initiateOAuth(wallet: string): Promise<TwitterOAuthResponse> {
    // If in development mode without real credentials, use mock
    if (this.isDevelopmentMode) {
      logger.warn('Using mock Twitter OAuth - set real TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET for production');
      return this.mockOAuthInitiation(wallet);
    }

    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'users.read tweet.read follows.read',
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
   * Mock OAuth initiation for development
   */
  private mockOAuthInitiation(wallet: string): TwitterOAuthResponse {
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=dev_mode&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=users.read&state=${state}&code_challenge=${codeVerifier}&code_challenge_method=S256`;

    return {
      authUrl,
      state,
      codeVerifier
    };
  }

  
  /**
   * Handle Twitter OAuth callback
   */
  async handleCallback(
    wallet: string, 
    code: string, 
    state: string, 
    codeVerifier: string
  ): Promise<TwitterUser> {
    try {
      // If in development mode, use mock callback
      if (this.isDevelopmentMode) {
        return this.mockCallback(wallet);
      }

      // DEBUG: Check what credentials we're using
        console.log('=== TWITTER DEBUG ===');
        console.log('Client ID:', this.clientId);
        console.log('Client Secret exists:', !!this.clientSecret);
        console.log('Client Secret length:', this.clientSecret?.length);
        console.log('Redirect URI:', this.redirectUri);
        console.log('=== END DEBUG ===');
        console.log('=== REQUEST DEBUG ===');
        const requestBody = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
        }).toString();

        console.log('Request URL: https://api.twitter.com/2/oauth2/token');
        console.log('Request Body (masked):', requestBody.replace(this.clientSecret, '***MASKED***'));
        console.log('=== END REQUEST DEBUG ===');
      // Exchange code for access token
      const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
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
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error(`Twitter token exchange failed: ${errorText}`);
        throw new Error(`Twitter OAuth token exchange failed: ${tokenResponse.status}`);
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
      await this.saveSocialConnection(wallet, twitterUser, accessToken);

      logger.info(`Twitter OAuth completed for wallet: ${wallet}, Twitter user: @${twitterUser.username}`);
      return twitterUser;

    } catch (error) {
      logger.error(`Twitter OAuth callback error for wallet ${wallet}:`, error);
      throw new Error(`Twitter authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mock callback for development
   */
  private async mockCallback(wallet: string): Promise<TwitterUser> {
    logger.warn('Using mock Twitter callback - development mode');
    
    // Generate a mock Twitter user
    const twitterUser: TwitterUser = {
      id: `mock_twitter_${Date.now()}`,
      username: `mockuser_${wallet.slice(2, 8)}`,
      name: `Mock User ${wallet.slice(2, 8)}`
    };

    // Save mock connection
    await this.saveSocialConnection(wallet, twitterUser, 'mock_access_token');

    return twitterUser;
  }

  /**
   * Verify if user follows specific Twitter account
   */
  async verifyFollow(
    wallet: string, 
    targetUsername: string
  ): Promise<{ verified: boolean; details: any }> {
    try {
      // If in development mode, use mock verification
      if (this.isDevelopmentMode) {
        return this.mockVerifyFollow(wallet, targetUsername);
      }

      // Get user's Twitter connection
      const connection = await socialConnectionRepository.findOne({
        where: { 
          wallet: wallet.toLowerCase(), 
          platform: 'twitter',
          isActive: true
        }
      });

      if (!connection || !connection.accessToken) {
        return {
          verified: false,
          details: {
            error: 'Twitter account not connected',
            requiredAction: 'Connect your Twitter account first',
            connected: false
          }
        };
      }

      // Get target user ID
      const targetUser = await this.getUserByUsername(targetUsername, connection.accessToken);
      if (!targetUser) {
        return {
          verified: false,
          details: {
            error: `Twitter account @${targetUsername} not found`,
            targetUsername,
            connected: true
          }
        };
      }

      // Check if user follows target account
      const follows = await this.checkFollow(connection.platformUserId, targetUser.id, connection.accessToken);

      return {
        verified: follows,
        details: {
          connected: true,
          userTwitterHandle: connection.platformHandle,
          targetUsername,
          targetUserId: targetUser.id,
          follows,
          checkedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error(`Twitter follow verification error for ${wallet}, target: ${targetUsername}:`, error);
      return {
        verified: false,
        details: {
          error: error instanceof Error ? error.message : 'Verification service error',
          targetUsername,
          connected: true
        }
      };
    }
  }

  /**
   * Mock follow verification for development
   */
  private async mockVerifyFollow(wallet: string, targetUsername: string): Promise<{ verified: boolean; details: any }> {
    logger.warn('Using mock Twitter follow verification - development mode');
    
    // Mock: 70% success rate for testing
    const verified = Math.random() > 0.3;
    
    return {
      verified,
      details: {
        connected: true,
        userTwitterHandle: `mockuser_${wallet.slice(2, 8)}`,
        targetUsername,
        targetUserId: `mock_target_${targetUsername}`,
        follows: verified,
        checkedAt: new Date().toISOString(),
        mock: true,
        note: 'This is a mock implementation - set real Twitter credentials for production'
      }
    };
  }

  /**
   * Get Twitter user by username
   */
  private async getUserByUsername(username: string, accessToken: string): Promise<{ id: string; username: string } | null> {
    const response = await fetch(
      `https://api.twitter.com/2/users/by/username/${username}?user.fields=id,username,name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // User not found
      }
      throw new Error(`Twitter API error: ${response.status}`);
    }

    const data = await response.json() as TwitterUserResponse;
    return data.data;
  }

  /**
   * Check if user follows target account
   */
  private async checkFollow(sourceUserId: string, targetUserId: string, accessToken: string): Promise<boolean> {
    const response = await fetch(
      `https://api.twitter.com/2/users/${sourceUserId}/following?max_results=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Twitter following API error: ${response.status}`);
    }

    const data = await response.json() as TwitterFollowingResponse;
    
    // Check if target user is in the following list
    return data.data?.some((user: any) => user.id === targetUserId) || false;
  }

  /**
   * Save social connection to database
   */
  private async saveSocialConnection(
    wallet: string, 
    twitterUser: TwitterUser, 
    accessToken: string
  ): Promise<void> {
    let connection = await socialConnectionRepository.findOne({
      where: { 
        wallet: wallet.toLowerCase(), 
        platform: 'twitter' 
      }
    });

    if (connection) {
      // Update existing connection
      connection.platformUserId = twitterUser.id;
      connection.platformHandle = twitterUser.username;
      connection.accessToken = accessToken;
      connection.isActive = true;
      connection.connectedAt = new Date();
    } else {
      // Create new connection
      connection = socialConnectionRepository.create({
        wallet: wallet.toLowerCase(),
        platform: 'twitter',
        platformUserId: twitterUser.id,
        platformHandle: twitterUser.username,
        accessToken,
        isActive: true,
        connectedAt: new Date()
      });
    }

    await socialConnectionRepository.save(connection);
    logger.info(`Saved Twitter connection for wallet: ${wallet}, Twitter: @${twitterUser.username}`);
  }

  /**
   * Get user's Twitter connection status
   */
  async getConnectionStatus(wallet: string): Promise<{ connected: boolean; username?: string }> {
    const connection = await socialConnectionRepository.findOne({
      where: { 
        wallet: wallet.toLowerCase(), 
        platform: 'twitter',
        isActive: true 
      }
    });

    return {
      connected: !!connection,
      username: connection?.platformHandle || undefined
    };
  }

  /**
   * Disconnect Twitter account
   */
  async disconnect(wallet: string): Promise<void> {
    const connection = await socialConnectionRepository.findOne({
      where: { 
        wallet: wallet.toLowerCase(), 
        platform: 'twitter' 
      }
    });
  
    if (connection) {
      connection.isActive = false;
      connection.accessToken = undefined; // Use undefined instead of null
      await socialConnectionRepository.save(connection);
      logger.info(`Disconnected Twitter for wallet: ${wallet}`);
    }
  }
}

export const twitterService = new TwitterService();