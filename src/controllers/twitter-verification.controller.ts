// src/controllers/twitter-verification.controller.ts
import { Request, Response } from 'express';
import { twitterService } from '../services/twitter.service';
import { logger } from '../utils/logger';

export class TwitterVerificationController {
  /**
   * Initiate Twitter OAuth flow
   */
  async initiateOAuth(req: Request, res: Response) {
    try {
      const { wallet } = req.body;
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const oauthResponse = await twitterService.initiateOAuth(wallet);
      
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
        codeVerifier as string
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
   * Get Twitter connection status
   */
  async getConnectionStatus(req: Request, res: Response) {
    try {
      const { wallet } = req.params;
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const status = await twitterService.getConnectionStatus(wallet);
      
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
   * Disconnect Twitter account
   */
  async disconnect(req: Request, res: Response) {
    try {
      const { wallet } = req.body;
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      await twitterService.disconnect(wallet);
      
      res.json({
        success: true,
        data: {
          message: 'Twitter account disconnected successfully'
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
   * Verify Twitter follow (for testing)
   */
  async verifyFollow(req: Request, res: Response) {
    try {
      const { wallet, targetUsername } = req.body;
      
      if (!wallet || !targetUsername) {
        return res.status(400).json({
          success: false,
          error: 'Wallet and targetUsername are required'
        });
      }

      const result = await twitterService.verifyFollow(wallet, targetUsername);
      
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
}

export const twitterVerificationController = new TwitterVerificationController();