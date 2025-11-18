import axios from 'axios';
import { logger } from '../utils/logger';

export interface WebhookPayload {
  event: string;
  wallet: string;
  verificationId?: string;
  did?: string;
  provider: string;
  timestamp: string;
  metadata?: any;
}

export class WebhookService {
  private webhookUrls: Map<string, string> = new Map(); // issuerId -> webhookUrl

  registerWebhook(issuerId: string, webhookUrl: string): void {
    this.webhookUrls.set(issuerId, webhookUrl);
    logger.info(`Registered webhook for issuer ${issuerId}: ${webhookUrl}`);
  }

  async sendWebhook(issuerId: string, payload: WebhookPayload): Promise<void> {
    const webhookUrl = this.webhookUrls.get(issuerId);
    if (!webhookUrl) {
      logger.warn(`No webhook registered for issuer: ${issuerId}`);
      return;
    }

    try {
      await axios.post(webhookUrl, payload, {
        timeout: 10000, // 10 second timeout
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Badge-Verification-Backend/1.0.0'
        }
      });
      logger.info(`Webhook sent successfully to ${issuerId} for event: ${payload.event}`);
    } catch (error) {
      logger.error(`Failed to send webhook to ${issuerId}:`, error);
      // In production, you might want to retry or queue failed webhooks
    }
  }

  getRegisteredIssuers(): string[] {
    return Array.from(this.webhookUrls.keys());
  }
}

export const webhookService = new WebhookService();