// src/services/websocket-events.service.ts
import { webSocketService } from './websocket.service';
import { logger } from '../utils/logger';

export class WebSocketEventsService {
  private demoInterval: NodeJS.Timeout | null = null;

  startDemoEvents(): void {
    if (this.demoInterval) {
      this.stopDemoEvents();
    }

    logger.info('Starting WebSocket demo events');

    // Send system health updates every 10 seconds
    const healthInterval = setInterval(() => {
      webSocketService.sendSystemHealthUpdate();
    }, 10000);

    // Send demo minting events every 5-15 seconds randomly
    this.demoInterval = setInterval(() => {
      const delay = 5000 + Math.random() * 10000;
      setTimeout(() => {
        webSocketService.sendDemoMintingEvent();
      }, delay);
    }, 5000);

    // Store intervals for cleanup
    (this.demoInterval as any).healthInterval = healthInterval;
  }

  stopDemoEvents(): void {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      clearInterval((this.demoInterval as any).healthInterval);
      this.demoInterval = null;
      logger.info('Stopped WebSocket demo events');
    }
  }

  // MINTING EVENTS

  sendMintingStarted(wallet: string, badgeTypeKey: string, mintId: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting minting_started for ${wallet}, mint: ${mintId}`);
    
    webSocketService.sendToWallet(wallet, {
        type: 'minting_started',
        payload: {
          wallet,
          badgeTypeKey,
          mintId,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    // Also broadcast to minting channel
    webSocketService.sendToChannel('minting', {
        type: 'minting_started',
        payload: {
          wallet,
          badgeTypeKey,
          mintId,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
      // Also send to wallet_events channel for wallet-specific subscribers
  webSocketService.sendToChannel('wallet_events', {
    type: 'minting_started',
    payload: {
      wallet,
      badgeTypeKey,
      mintId,
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
  }

  sendTransactionStarting(wallet: string, badgeTypeKey: string, mintId: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting blockchain_transaction_starting for ${wallet}, mint: ${mintId}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'blockchain_transaction_starting',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to transactions channel
    webSocketService.sendToChannel('transactions', {
      type: 'blockchain_transaction_starting',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendTransactionSubmitted(wallet: string, badgeTypeKey: string, mintId: string, transactionHash: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting blockchain_transaction_submitted for ${wallet}, tx: ${transactionHash}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'blockchain_transaction_submitted',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        transactionHash,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to transactions channel
    webSocketService.sendToChannel('transactions', {
      type: 'blockchain_transaction_submitted',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        transactionHash,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendMintingCompleted(wallet: string, badgeTypeKey: string, mintId: string, tokenId: number, transactionHash: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting minting_completed for ${wallet}, token: ${tokenId}, tx: ${transactionHash}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'minting_completed',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        tokenId,
        transactionHash,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to all minting subscribers
    webSocketService.sendToChannel('minting', {
      type: 'minting_success',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        tokenId,
        transactionHash,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Also broadcast to transactions channel
    webSocketService.sendToChannel('transactions', {
      type: 'transaction_confirmed',
      payload: {
        type: 'badge_mint',
        wallet,
        transactionHash,
        badgeTypeKey,
        tokenId,
        mintId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendMintingFailed(wallet: string, badgeTypeKey: string, mintId: string, error: string): void {
    logger.error(`📢 [WebSocketEvents] Emitting minting_failed for ${wallet}, mint: ${mintId}, error: ${error}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'minting_failed',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        error,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast failure to minting channel
    webSocketService.sendToChannel('minting', {
      type: 'minting_failed',
      payload: {
        wallet,
        badgeTypeKey,
        mintId,
        error,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendBadgeRevoked(wallet: string, mintId: string, reason: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting badge_revoked for ${wallet}, mint: ${mintId}, reason: ${reason}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'badge_revoked',
      payload: {
        wallet,
        mintId,
        reason,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to admin/audit channel
    webSocketService.sendToChannel('admin', {
      type: 'badge_revoked',
      payload: {
        wallet,
        mintId,
        reason,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Also broadcast to minting channel
    webSocketService.sendToChannel('minting', {
      type: 'badge_revoked',
      payload: {
        wallet,
        mintId,
        reason,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // STATUS UPDATE EVENTS

  sendMintStatusUpdate(wallet: string, mintId: string, badgeTypeKey: string, status: string, details?: any): void {
    logger.info(`📢 [WebSocketEvents] Emitting mint_status_update for ${wallet}, mint: ${mintId}, status: ${status}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'mint_status_update',
      payload: {
        wallet,
        mintId,
        badgeTypeKey,
        status,
        details,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to minting channel
    webSocketService.sendToChannel('minting', {
      type: 'mint_status_update',
      payload: {
        wallet,
        mintId,
        badgeTypeKey,
        status,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // VERIFICATION EVENTS

  sendVerificationStarted(wallet: string, provider: string, sessionId: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting verification_started for ${wallet}, provider: ${provider}, session: ${sessionId}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'verification_started',
      payload: {
        wallet,
        provider,
        sessionId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to verification channel
    webSocketService.sendToChannel('verification', {
      type: 'verification_started',
      payload: {
        wallet,
        provider,
        sessionId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendVerificationCompleted(wallet: string, provider: string, sessionId: string, did: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting verification_completed for ${wallet}, provider: ${provider}, session: ${sessionId}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'verification_completed',
      payload: {
        wallet,
        provider,
        sessionId,
        did,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to verification channel
    webSocketService.sendToChannel('verification', {
      type: 'verification_success',
      payload: {
        wallet,
        provider,
        sessionId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendVerificationFailed(wallet: string, provider: string, sessionId: string, error: string): void {
    logger.error(`📢 [WebSocketEvents] Emitting verification_failed for ${wallet}, provider: ${provider}, session: ${sessionId}, error: ${error}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'verification_failed',
      payload: {
        wallet,
        provider,
        sessionId,
        error,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Broadcast to verification channel
    webSocketService.sendToChannel('verification', {
      type: 'verification_failed',
      payload: {
        wallet,
        provider,
        sessionId,
        error,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // ELIGIBILITY EVENTS

  sendEligibilityCheckStarted(wallet: string, badgeTypeKey: string): void {
    logger.info(`📢 [WebSocketEvents] Emitting eligibility_check_started for ${wallet}, badge: ${badgeTypeKey}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'eligibility_check_started',
      payload: {
        wallet,
        badgeTypeKey,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  sendEligibilityCheckCompleted(wallet: string, badgeTypeKey: string, eligible: boolean, missingRequirements: string[] = []): void {
    logger.info(`📢 [WebSocketEvents] Emitting eligibility_check_completed for ${wallet}, badge: ${badgeTypeKey}, eligible: ${eligible}`);
    
    webSocketService.sendToWallet(wallet, {
      type: 'eligibility_check_completed',
      payload: {
        wallet,
        badgeTypeKey,
        eligible,
        missingRequirements,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // SYSTEM EVENTS

  sendSystemHealthUpdate(): void {
    webSocketService.sendSystemHealthUpdate();
  }

  sendDemoMintingEvent(): void {
    webSocketService.sendDemoMintingEvent();
  }
}

export const webSocketEventsService = new WebSocketEventsService();