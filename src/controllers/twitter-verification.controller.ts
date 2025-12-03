// src/controllers/twitter-verification.controller.ts
import { Request, Response } from 'express';
import { twitterService } from '../services/twitter.service';
import { logger } from '../utils/logger';
import { verificationService } from '../services/verification.service'; // ADDED

export class TwitterVerificationController {
  /**
   * Initiate Twitter OAuth flow
   */
  async initiateOAuth(req: Request, res: Response) {
    try {
      const { wallet, issuerId, targetAccount } = req.body; // ADDED issuerId, targetAccount
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      // ADDED: Store issuer context if provided
      let metadata: any = {};
      if (issuerId) {
        metadata.issuerId = issuerId;
      }
      if (targetAccount) {
        metadata.targetAccount = targetAccount;
      }

      const oauthResponse = await twitterService.initiateOAuth(wallet, metadata); // UPDATED: Pass metadata
      
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
   * Handle Twitter OAuth callback
   */
  // In src/controllers/twitter-verification.controller.ts - Update the GET callback part
  async handleCallback(req: Request, res: Response) {
    try {
      console.log('Twitter callback received - Method:', req.method);
      console.log('Query params:', req.query);
      console.log('Body:', req.body);
  
      // Handle both GET (query params) and POST (body) requests
      const code = req.query.code || req.body.code;
      const state = req.query.state || req.body.state;
      const wallet = req.body.wallet;
      const codeVerifier = req.body.code_verifier;
      const issuerId = req.body.issuerId; // ADDED
  
      if (!code || !state) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: code and state'
        });
      }
  
      // For GET requests (Twitter redirect)
      if (req.method === 'GET') {
        // Return an HTML page that automatically sends the OAuth data back
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Twitter Verification - Complete Setup</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 40px;
            backdrop-filter: blur(10px);
            max-width: 500px;
            margin: 0 auto;
        }
        .success { 
            color: #1DA1F2; 
            font-size: 28px;
            margin-bottom: 20px;
        }
        .message { 
            margin: 20px 0; 
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">✓ Twitter Authorization Received</div>
        <div class="message">Completing verification automatically...</div>
    </div>
    
    <script>
        // AUTO-SEND THE MESSAGE TO PARENT WINDOW
        if (window.opener) {
            window.opener.postMessage({
                type: 'TWITTER_OAUTH_SUCCESS',
                code: '${code}',
                state: '${state}'
            }, '*');
            
            // Close the popup after 1 second
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            // Fallback for if opener is not available
            document.body.innerHTML = '<div class="container"><div class="success">✓ Twitter Authorization Received</div><div class="message">Please copy this authorization code and return to the main window:</div><div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; font-family: monospace; font-size: 12px; word-break: break-all;">Code: ${code}<br>State: ${state}</div><button style="background: #1DA1F2; color: white; border: none; padding: 12px 30px; border-radius: 25px; font-size: 16px; cursor: pointer;" onclick="copyData()">Copy Authorization Data</button></div>';
            
            function copyData() {
                const data = { code: '${code}', state: '${state}' };
                navigator.clipboard.writeText(JSON.stringify(data));
                alert('Authorization data copied to clipboard!');
            }
        }
    </script>
</body>
</html>
`;
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }
  
      // Handle POST request (from frontend with wallet and codeVerifier)
      if (!wallet || !codeVerifier) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: wallet and code_verifier'
        });
      }
  
      const twitterUser = await twitterService.handleCallback(
        wallet as string, 
        code as string, 
        state as string, 
        codeVerifier as string,
        issuerId // ADDED: Pass issuerId to service
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
      
      // Return error page for GET requests
      if (req.method === 'GET') {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>Twitter Verification Failed</title>
              <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .error { color: #FF0000; font-size: 24px; }
                  .message { margin: 20px 0; }
              </style>
          </head>
          <body>
              <div class="error">✗ Twitter Verification Failed</div>
              <div class="message">${error instanceof Error ? error.message : 'Unknown error'}</div>
              <div class="message">Please try again.</div>
              <script>
                  if (window.opener) {
                      window.opener.postMessage({
                          type: 'TWITTER_OAUTH_ERROR',
                          error: '${error instanceof Error ? error.message : 'Unknown error'}'
                      }, '*');
                  }
              </script>
          </body>
          </html>
        `;
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
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