// src/services/websocket.service.ts
import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  channel?: string;
}

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  isAlive: boolean;
  subscriptions: Set<string>;
  user?: {
    wallet?: string;
    userId?: string;
  };
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private messageHandlers: Map<string, (client: WebSocketClient, message: WebSocketMessage) => void> = new Map();

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.setupEventHandlers();
    this.startHeartbeat();
    
    logger.info('WebSocket server initialized');
  }

  private setupEventHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (socket: WebSocket, request) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        socket,
        isAlive: true,
        subscriptions: new Set()
      };

      this.clients.set(clientId, client);
      logger.info(`WebSocket client connected: ${clientId}`);

      // Extract user info from query params or headers
      this.authenticateClient(client, request);

      socket.on('message', (data) => {
        this.handleMessage(client, data.toString());
      });

      socket.on('pong', () => {
        client.isAlive = true;
      });

      socket.on('close', () => {
        this.handleDisconnect(clientId);
      });

      socket.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.handleDisconnect(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connection_established',
        payload: { clientId, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      });
    });
  }

  private authenticateClient(client: WebSocketClient, request: any): void {
    // Extract wallet from query string for simple authentication
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const wallet = url.searchParams.get('wallet');
    
    if (wallet) {
      client.user = { wallet };
      logger.info(`WebSocket client ${client.id} authenticated as wallet: ${wallet}`);
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleMessage(client: WebSocketClient, data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);
      
      // Validate message structure
      if (!message.type) {
        this.sendError(client.id, 'Invalid message: missing type');
        return;
      }

      logger.debug(`WebSocket message from ${client.id}:`, message);

      // Handle subscription messages
      if (message.type === 'subscribe') {
        this.handleSubscription(client, message);
        return;
      }

      if (message.type === 'unsubscribe') {
        this.handleUnsubscription(client, message);
        return;
      }

      if (message.type === 'ping') {
        this.sendToClient(client.id, {
          type: 'pong',
          payload: { timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Call custom message handler if registered
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(client, message);
      } else {
        this.sendError(client.id, `Unknown message type: ${message.type}`);
      }

    } catch (error) {
      logger.error(`Error handling WebSocket message from ${client.id}:`, error);
      this.sendError(client.id, 'Invalid message format');
    }
  }

  private handleSubscription(client: WebSocketClient, message: WebSocketMessage): void {
    let channels: string[] = [];
  
    // ✅ SUPPORT MULTIPLE FORMATS for backward compatibility
    if (message.payload?.channels && Array.isArray(message.payload.channels)) {
      // New format: { type: 'subscribe', payload: { channels: ['minting', 'transactions'] } }
      channels = message.payload.channels;
    } else if (message.channel) {
      // Old format: { type: 'subscribe', channel: 'minting' }
      channels = [message.channel];
    } else if (message.payload?.channel) {
      // Alternative format: { type: 'subscribe', payload: { channel: 'minting' } }
      channels = [message.payload.channel];
    } else {
      this.sendError(client.id, 'Subscription requires channels array or channel field');
      return;
    }
  
    channels.forEach((channel: string) => {
      client.subscriptions.add(channel);
    });
  
    this.sendToClient(client.id, {
      type: 'subscription_confirmed',
      payload: { 
        channels: Array.from(client.subscriptions),
        subscribed: channels,
        note: 'Successfully subscribed to channels'
      },
      timestamp: new Date().toISOString()
    });
  
    logger.info(`Client ${client.id} subscribed to channels: ${channels.join(', ')}`);
  }

  private handleUnsubscription(client: WebSocketClient, message: WebSocketMessage): void {
    const channels = message.payload?.channels;
    
    if (channels && Array.isArray(channels)) {
      channels.forEach((channel: string) => {
        client.subscriptions.delete(channel);
      });
    } else {
      // Unsubscribe from all channels if none specified
      client.subscriptions.clear();
    }

    this.sendToClient(client.id, {
      type: 'unsubscription_confirmed',
      payload: { channels: Array.from(client.subscriptions) },
      timestamp: new Date().toISOString()
    });

    logger.info(`Client ${client.id} unsubscribed from channels: ${channels?.join(', ') || 'all'}`);
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      logger.info(`WebSocket client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }

  private startHeartbeat(): void {
    const interval = setInterval(() => {
      if (!this.wss) {
        clearInterval(interval);
        return;
      }

      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.socket.terminate();
          this.handleDisconnect(client.id);
          return;
        }

        client.isAlive = false;
        client.socket.ping();
      });
    }, 30000); // 30 seconds
  }

  // Public API Methods
  broadcast(message: WebSocketMessage, channel?: string): void {
    this.clients.forEach((client) => {
      if (!channel || client.subscriptions.has(channel)) {
        this.sendToClient(client.id, message);
      }
    });
  }

  sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  sendToWallet(wallet: string, message: WebSocketMessage): void {
    this.clients.forEach((client) => {
      if (client.user?.wallet === wallet && client.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(client.id, message);
      }
    });
  }

  sendToChannel(channel: string, message: WebSocketMessage): void {
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) && client.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(client.id, message);
      }
    });
  }

  registerMessageHandler(messageType: string, handler: (client: WebSocketClient, message: WebSocketMessage) => void): void {
    this.messageHandlers.set(messageType, handler);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSubscriptionCount(): { [channel: string]: number } {
    const counts: { [channel: string]: number } = {};
    
    this.clients.forEach((client) => {
      client.subscriptions.forEach((channel) => {
        counts[channel] = (counts[channel] || 0) + 1;
      });
    });

    return counts;
  }

  // Add method to send system health updates
  sendSystemHealthUpdate(): void {
    const healthMessage: WebSocketMessage = {
      type: 'system_health',
      payload: {
        clients: this.getClientCount(),
        subscriptions: this.getSubscriptionCount(),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      },
      timestamp: new Date().toISOString()
    };

    this.sendToChannel('system', healthMessage);
  }

  // Add demo events for testing
  sendDemoMintingEvent(): void {
    const demoWallets = [
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
    ];
    
    const demoBadges = ['verified-creator', 'early-supporter', 'dao-voter'];
    const demoWallet = demoWallets[Math.floor(Math.random() * demoWallets.length)];
    const demoBadge = demoBadges[Math.floor(Math.random() * demoBadges.length)];
    const status = ['pending', 'completed', 'failed'][Math.floor(Math.random() * 3)];

    const demoEvent: WebSocketMessage = {
      type: 'demo_minting_event',
      payload: {
        wallet: demoWallet,
        badgeTypeKey: demoBadge,
        status: status,
        transactionHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        timestamp: new Date().toISOString(),
        note: 'This is a demo event for testing WebSocket functionality'
      },
      timestamp: new Date().toISOString()
    };

    this.sendToChannel('minting', demoEvent);
    this.sendToChannel('transactions', demoEvent);
  }

  private sendError(clientId: string, error: string): void {
    this.sendToClient(clientId, {
      type: 'error',
      payload: { error },
      timestamp: new Date().toISOString()
    });
  }
}

// Create and export singleton instance
export const webSocketService = new WebSocketService();