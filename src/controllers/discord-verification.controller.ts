import { Request, Response } from 'express';
import { discordService } from '../services/discord.service';
import { issuerSocialService } from '../services/issuer-social.service';
import { logger } from '../utils/logger';
import { verificationService } from '../services/verification.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { oauthStateStore } from '../services/oauth-state.service';
import { renderOAuthCallbackPage, renderOAuthErrorPage } from '../utils/oauth-pages';

export class DiscordVerificationController {
  /**
   * Initiate Discord OAuth flow
   */
  async initiateOAuth(req: AuthenticatedRequest, res: Response) {
    try {
      const { wallet, issuerId, serverInfo } = req.body;
      const signedInWallet = req.user?.wallet?.toLowerCase();

      if (!signedInWallet) {
        return res.status(401).json({
          success: false,
          error: 'Sign in with your wallet first'
        });
      }

      // The login is tied to the signed-in wallet. Accepting a different wallet
      // from the body would let one user attach an account to someone else's.
      if (wallet && String(wallet).toLowerCase() !== signedInWallet) {
        return res.status(403).json({
          success: false,
          error: 'Wallet does not match the signed-in user'
        });
      }

      const metadata: any = {};
      if (issuerId) {
        metadata.issuerId = issuerId;
      }
      if (serverInfo) {
        metadata.serverInfo = serverInfo;
      }

      const oauthResponse = await discordService.initiateOAuth(signedInWallet, metadata);

      // Remember who started this login so the callback can be checked.
      await oauthStateStore.save('discord', oauthResponse.state, {
        wallet: signedInWallet,
        issuerId,
      });

      res.json({
        success: true,
        data: oauthResponse
      });

    } catch (error) {
      logger.error('Discord OAuth initiation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Discord authentication'
      });
    }
  }

  /**
   * Handle Discord OAuth callback.
   *
   * GET is the provider redirecting the popup back to us; it only hands
   * code/state to the page that opened the popup. POST is that page sending
   * them on, and is where the state is checked against the stored record.
   */
  async handleCallback(req: AuthenticatedRequest, res: Response) {
    const isRedirect = req.method === 'GET';

    try {
      const code = req.query.code || req.body?.code;
      const state = req.query.state || req.body?.state;

      if (!code || !state) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: code and state'
        });
      }

      if (isRedirect) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(renderOAuthCallbackPage({
          provider: 'discord',
          code: String(code),
          state: String(state)
        }));
      }

      const signedInWallet = req.user?.wallet?.toLowerCase();
      if (!signedInWallet) {
        return res.status(401).json({
          success: false,
          error: 'Sign in with your wallet first'
        });
      }

      // Single use: consume() deletes the record, so a replayed state fails.
      const pending = await oauthStateStore.consume('discord', state);
      if (!pending) {
        return res.status(400).json({
          success: false,
          error: 'This Discord login has expired or was already used. Please start again.'
        });
      }

      if (pending.wallet !== signedInWallet) {
        return res.status(403).json({
          success: false,
          error: 'This Discord login was started by a different wallet'
        });
      }

      // Wallet, issuer and verifier come from our own record, not the request.
      const discordUser = await discordService.handleCallback(
        pending.wallet,
        String(code),
        state as string,
        pending.issuerId
      );

      res.json({
        success: true,
        data: {
          discordUser,
          message: 'Discord account connected successfully'
        }
      });

    } catch (error) {
      logger.error('Discord OAuth callback error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (isRedirect) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(renderOAuthErrorPage({ provider: 'discord', message }));
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Discord authentication failed'
      });
    }
  }

  /**
   * Get Discord connection status
   */
  async getConnectionStatus(req: Request, res: Response) {
    try {
      const { wallet } = req.params;
      const { issuerId } = req.query;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const status = await discordService.getConnectionStatus(wallet, issuerId as string);

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Discord connection status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Discord connection status'
      });
    }
  }

  /**
   * Verify Discord server membership
   */
  async verifyServerMembership(req: Request, res: Response) {
    try {
      const { wallet, serverId, issuerId } = req.body;

      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet is required'
        });
      }

      let finalServerId = serverId;
      if (issuerId && !serverId) {
        finalServerId = (await issuerSocialService.getDiscordServer(issuerId))?.serverId;
      }

      if (!finalServerId) {
        return res.status(400).json({
          success: false,
          error: 'Server ID is required'
        });
      }

      const result = await discordService.verifyServerMembership(
        wallet,
        finalServerId,
        issuerId
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Discord server verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify Discord server membership'
      });
    }
  }

  /**
   * NEW: Get issuer-specific Discord requirements
   */
  async getIssuerRequirements(req: Request, res: Response) {
    try {
      const { issuerId } = req.params;
      const { wallet } = req.query;

      if (!issuerId) {
        return res.status(400).json({
          success: false,
          error: 'Issuer ID is required'
        });
      }

      const server = await issuerSocialService.getDiscordServer(issuerId);
      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'This issuer has not configured a Discord requirement'
        });
      }
      const issuerRequirements = {
        ruleType: 'discord_member',
        name: 'Discord Membership',
        description: 'Join the issuer\'s Discord server',
        parameters: { serverId: server.serverId, serverName: server.serverName },
        isRequired: true
      };

      let status = 'not_started';
      let existingVerification = null;

      // Check if user has existing verification for this issuer
      if (wallet) {
        const verifications = await verificationService.getAllVerifications(wallet as string, {
          provider: 'discord_member'
        });

        existingVerification = verifications.verifications.find(v =>
          v.metadata?.issuerId === issuerId
        );

        if (existingVerification) {
          status = existingVerification.status === 'completed' ? 'completed' :
                   existingVerification.status === 'failed' ? 'failed' : 'pending';
        }
      }

      res.json({
        success: true,
        data: {
          issuerId,
          requirement: issuerRequirements,
          status,
          existingVerification: existingVerification ? {
            id: existingVerification.id,
            status: existingVerification.status,
            metadata: existingVerification.metadata,
            completedAt: existingVerification.completedAt
          } : null,
          actionRequired: `Join the ${issuerRequirements.parameters.serverName ?? issuerRequirements.parameters.serverId} Discord server`
        }
      });

    } catch (error) {
      logger.error('Get issuer Discord requirements error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get issuer Discord requirements'
      });
    }
  }
}

export const discordVerificationController = new DiscordVerificationController();