// src/controllers/discord-verification.controller.ts
import { Request, Response } from 'express';
import { discordService } from '../services/discord.service';
import { logger } from '../utils/logger';

export class DiscordVerificationController {
  /**
   * Initiate Discord OAuth flow
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

      const oauthResponse = await discordService.initiateOAuth(wallet);
      
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
   * Handle Discord OAuth callback
   */
  async handleCallback(req: Request, res: Response) {
    try {
      console.log('Discord callback received - Method:', req.method);
      console.log('Query params:', req.query);
      console.log('Body:', req.body);

      // Handle both GET (query params) and POST (body) requests
      const code = req.query.code || req.body.code;
      const state = req.query.state || req.body.state;
      const wallet = req.body.wallet;

      if (!code || !state) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: code and state'
        });
      }

      // For GET requests (Discord redirect)
      if (req.method === 'GET') {
        // In the GET callback handler, replace the HTML with this auto-submitting version:
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Discord Verification - Complete Setup</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background: linear-gradient(135deg, #5865F2 0%, #7289DA 100%);
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
                        color: #5865F2; 
                        font-size: 28px;
                        margin-bottom: 20px;
                    }
                    .message { 
                        margin: 20px 0; 
                        font-size: 16px;
                    }
                    .button {
                        background: #5865F2;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 25px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success">✓ Discord Authorization Received</div>
                    <div class="message">Completing verification automatically...</div>
                </div>
                
                <script>
                    // AUTO-SEND THE MESSAGE TO PARENT WINDOW
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'DISCORD_OAUTH_SUCCESS',
                            code: '${code}',
                            state: '${state}'
                        }, '*');
                        
                        // Close the popup after 1 second
                        setTimeout(() => {
                            window.close();
                        }, 1000);
                    } else {
                        // Fallback for if opener is not available
                        document.body.innerHTML = '<div class="container">' +
                            '<div class="success">✓ Discord Authorization Received</div>' +
                            '<div class="message">Please copy this authorization code and return to the main window:</div>' +
                            '<div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; font-family: monospace; font-size: 12px; word-break: break-all;">' +
                            'Code: ${code}<br>State: ${state}</div>' +
                            '<button class="button" onclick="copyData()">Copy Authorization Data</button>' +
                            '</div>';
                        
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

      // Handle POST request (from frontend with wallet)
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: wallet'
        });
      }

      const discordUser = await discordService.handleCallback(
        wallet as string, 
        code as string, 
        state as string
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
      
      // Return error page for GET requests
      if (req.method === 'GET') {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>Discord Verification Failed</title>
              <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
                  .error { color: #FF0000; font-size: 24px; }
                  .message { margin: 20px 0; }
              </style>
          </head>
          <body>
              <div class="error">✗ Discord Verification Failed</div>
              <div class="message">${error instanceof Error ? error.message : 'Unknown error'}</div>
              <div class="message">Please try again.</div>
              <script>
                  if (window.opener) {
                      window.opener.postMessage({
                          type: 'DISCORD_OAUTH_ERROR',
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
      
      if (!wallet) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }

      const status = await discordService.getConnectionStatus(wallet);
      
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
      const { wallet, serverId } = req.body;
      
      if (!wallet || !serverId) {
        return res.status(400).json({
          success: false,
          error: 'Wallet and serverId are required'
        });
      }

      const result = await discordService.verifyServerMembership(wallet, serverId);
      
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
}

export const discordVerificationController = new DiscordVerificationController();