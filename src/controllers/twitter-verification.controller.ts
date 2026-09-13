// src/controllers/twitter-verification.controller.ts
import { Request, Response } from 'express';
import { twitterService } from '../services/twitter.service';
import { logger } from '../utils/logger';
import { verificationService } from '../services/verification.service'; // ADDED
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { oauthStateStore } from '../services/oauth-state.service';
import { renderOAuthCallbackPage, renderOAuthErrorPage } from '../utils/oauth-pages';

export class TwitterVerificationController {
  /**
   * Initiate Twitter OAuth flow
   */
  async initiateOAuth(req: AuthenticatedRequest, res: Response) {
    try {
      const { wallet, issuerId, targetAccount } = req.body;
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
      if (targetAccount) {
        metadata.targetAccount = targetAccount;
      }

      const oauthResponse = await twitterService.initiateOAuth(signedInWallet, metadata);

      // Remember who started this login so the callback can be checked.
      await oauthStateStore.save('twitter', oauthResponse.state, {
        wallet: signedInWallet,
        issuerId,
        codeVerifier: oauthResponse.codeVerifier,
      });

      res.json({
        success: true,
        data: oauthResponse
      });

    } catch (error) {
      logger.error('Twitter OAuth initiation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Twitter authentication'
      });
    }
  }

  /**
   * Handle Twitter OAuth callback.
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
          provider: 'twitter',
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
      const pending = await oauthStateStore.consume('twitter', state);
      if (!pending) {
        return res.status(400).json({
          success: false,
          error: 'This Twitter login has expired or was already used. Please start again.'
        });
      }

      if (pending.wallet !== signedInWallet) {
        return res.status(403).json({
          success: false,
          error: 'This Twitter login was started by a different wallet'
        });
      }

      if (!pending.codeVerifier) {
        return res.status(400).json({
          success: false,
          error: 'This Twitter login is missing its verifier. Please start again.'
        });
      }

      // Wallet, issuer and verifier come from our own record, not the request.
      const twitterUser = await twitterService.handleCallback(
        pending.wallet,
        String(code),
        state as string,
        pending.codeVerifier,
        pending.issuerId
      );

      res.json({
        success: true,
        data: {
          twitterUser,
          message: 'Twitter account connected successfully'
        }
      });

    } catch (error) {
      logger.error('Twitter OAuth callback error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (isRedirect) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(renderOAuthErrorPage({ provider: 'twitter', message }));
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Twitter authentication failed'
      });
    }
  }

  /**
   * Get Twitter connection status - UPDATED to accept issuerId
   */
  async getConnectionStatus(req: Request, res: Response) {
    try {
      const { wallet } = req.params;
      const { issuerId } = req.query; // ADDED: Optional issuerId query param
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const status = await twitterService.getConnectionStatus(wallet, issuerId as string); // UPDATED
      
      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Twitter connection status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Twitter connection status'
      });
    }
  }

  /**
   * Disconnect Twitter account - UPDATED to handle issuer-specific connections
   */
  async disconnect(req: Request, res: Response) {
    try {
      const { wallet, issuerId } = req.body; // ADDED issuerId
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      await twitterService.disconnect(wallet, issuerId); // UPDATED
      
      res.json({
        success: true,
        data: {
          message: issuerId ? 
            `Twitter account disconnected for issuer ${issuerId}` : 
            'Twitter account disconnected successfully'
        }
      });

    } catch (error) {
      logger.error('Twitter disconnect error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Twitter account'
      });
    }
  }

  /**
   * Verify Twitter follow (for testing) - UPDATED to accept issuerId
   */
  async verifyFollow(req: Request, res: Response) {
    try {
      const { wallet, targetUsername, issuerId } = req.body; // ADDED issuerId
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet is required'
        });
      }

      // If issuerId provided but no targetUsername, get issuer's Twitter handle
      let finalTargetUsername = targetUsername;
      if (issuerId && !targetUsername) {
        // In real implementation, fetch issuer's Twitter handle from database
        // For now, we'll use a placeholder
        const issuerHandle = await this.getIssuerTwitterHandle(issuerId);
        if (issuerHandle) {
          finalTargetUsername = issuerHandle;
        }
      }

      if (!finalTargetUsername) {
        return res.status(400).json({
          success: false,
          error: 'Target username is required'
        });
      }

      const result = await twitterService.verifyFollow(wallet, finalTargetUsername, issuerId); // UPDATED
      
      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Twitter follow verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify Twitter follow'
      });
    }
  }

  /**
   * NEW: Get issuer-specific verification requirements
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

      // In real implementation, fetch issuer's Twitter requirements from ProjectSocialRules
      // For now, return mock data
      const issuerRequirements = {
        ruleType: 'twitter_follow',
        name: 'Twitter Follow',
        description: 'Follow the issuer on Twitter',
        parameters: {
          account: 'issuer_twitter_handle', // This would come from database
          minFollowers: 1
        },
        isRequired: true
      };

      let status = 'not_started';
      let existingVerification = null;

      // Check if user has existing verification for this issuer
      if (wallet) {
        const verifications = await verificationService.getAllVerifications(wallet as string, {
          provider: 'twitter_follow'
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
          actionRequired: `Follow @${issuerRequirements.parameters.account} on Twitter`
        }
      });

    } catch (error) {
      logger.error('Get issuer Twitter requirements error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get issuer Twitter requirements'
      });
    }
  }

  /**
   * Helper: Get issuer's Twitter handle (mock implementation)
   */
  private async getIssuerTwitterHandle(issuerId: string): Promise<string | null> {
    try {
      // In real implementation, fetch from ProjectSocialRules
      // For now, return mock data
      const issuerHandles: Record<string, string> = {
        'test-issuer-1': 'Web3AcademyDAO',
        'test-issuer-2': 'DAOCollective',
        'test-issuer-3': 'NFTGalleryHQ'
      };
      
      return issuerHandles[issuerId] || null;
    } catch (error) {
      logger.error(`Error getting Twitter handle for issuer ${issuerId}:`, error);
      return null;
    }
  }
}

export const twitterVerificationController = new TwitterVerificationController();