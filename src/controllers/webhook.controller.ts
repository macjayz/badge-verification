import { Request, Response } from 'express';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

export class WebhookController {
  async registerWebhook(req: Request, res: Response) {
    try {
      const { issuerId, webhookUrl } = req.body;

      if (!issuerId || !webhookUrl) {
        return res.status(400).json({
          success: false,
          error: 'issuerId and webhookUrl are required'
        });
      }

      // Basic URL validation
      try {
        new URL(webhookUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook URL'
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

  async listWebhooks(req: Request, res: Response) {
    try {
      const issuers = webhookService.getRegisteredIssuers();

      res.json({
        success: true,
        issuers: issuers.map(issuerId => ({
          issuerId,
          // In production, you might want to mask the URL for security
          registered: true
        }))
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