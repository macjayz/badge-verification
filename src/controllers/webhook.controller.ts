import { Response } from 'express';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';
import { AuthenticatedIssuerRequest } from '../middleware/apiKey.middleware';

// Routes run behind authenticateApiKey, so req.issuer is the caller. The
// issuer is never taken from the body: that would let anyone redirect another
// issuer's webhook events to a URL of their choosing.
export class WebhookController {
  async registerWebhook(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      const issuerId = req.issuer!.id;
      const { issuerId: claimedIssuerId, webhookUrl } = req.body ?? {};

      if (claimedIssuerId !== undefined && claimedIssuerId !== issuerId) {
        return res.status(403).json({
          success: false,
          error: 'You can only register a webhook for your own issuer account'
        });
      }

      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          error: 'webhookUrl is required'
        });
      }

      let parsed: URL;
      try {
        parsed = new URL(webhookUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook URL'
        });
      }

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return res.status(400).json({
          success: false,
          error: 'Webhook URL must use http or https'
        });
      }

      webhookService.registerWebhook(issuerId, webhookUrl);

      res.json({
        success: true,
        message: 'Webhook registered successfully',
        issuerId,
        webhookUrl
      });

    } catch (error) {
      logger.error('Register webhook error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register webhook'
      });
    }
  }

  async listWebhooks(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      const issuerId = req.issuer!.id;

      res.json({
        success: true,
        issuers: [{
          issuerId,
          registered: webhookService.getRegisteredIssuers().includes(issuerId)
        }]
      });

    } catch (error) {
      logger.error('List webhooks error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list webhooks'
      });
    }
  }
}

export const webhookController = new WebhookController();
