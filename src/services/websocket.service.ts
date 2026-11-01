import { randomUUID } from 'crypto';
// src/services/websocket.service.ts
import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';
import { jwtService } from './jwt.service';

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
    wallet: string;
    userId: string;
    role?: string;
  };
  authTimer?: NodeJS.Timeout;
}

export interface WebSocketServiceOptions {
  /** How long a new connection has to send its auth message. */
  authTimeoutMs?: number;
}

// Close codes in the application range (4000-4999).
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_AUTH_TIMEOUT = 4408;

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private messageHandlers: Map<string, (client: WebSocketClient, message: WebSocketMessage) => void> = new Map();
  private heartbeat?: NodeJS.Timeout;
  private readonly authTimeoutMs: number;

  constructor(options: WebSocketServiceOptions = {}) {
    this.authTimeoutMs = options.authTimeoutMs ?? 10_000;
  }

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

      // Nothing is trusted from the URL. The client must send
      // { type: 'auth', payload: { token } } before it receives anything.
      this.warnAboutLegacyWalletParam(client, request);
      client.authTimer = setTimeout(() => {
        if (!client.user) {
          client.socket.close(WS_CLOSE_AUTH_TIMEOUT, 'Authentication required');
        }
      }, this.authTimeoutMs);

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
        payload: { clientId, authRequired: true, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      });
    });
  }

  private warnAboutLegacyWalletParam(client: WebSocketClient, request: any): void {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.searchParams.has('wallet')) {
      // Older clients claimed a wallet here. Anyone could claim any wallet,
      // so it is ignored.
      logger.warn(`WebSocket client ${client.id} sent ?wallet=; ignored, auth message required`);
    }
  }

  private handleAuth(client: WebSocketClient, message: WebSocketMessage): void {
    if (client.user) {
      this.sendError(client.id, 'Already authenticated');
      return;
    }

    const token = message.payload?.token;
    const payload = typeof token === 'string' ? jwtService.verifyToken(token) : null;
    if (!payload) {
      this.sendError(client.id, 'Invalid or expired token');
      client.socket.close(WS_CLOSE_UNAUTHORIZED, 'Invalid or expired token');
      return;
    }

    client.user = {
      wallet: payload.wallet.toLowerCase(),
      userId: payload.userId,
      role: payload.role
    };
    clearTimeout(client.authTimer);

    this.sendToClient(client.id, {
      type: 'authenticated',
      payload: { wallet: client.user.wallet, role: client.user.role ?? 'user' },
      timestamp: new Date().toISOString()
    });
    logger.info(`WebSocket client ${client.id} authenticated as ${client.user.role ?? 'user'} ${client.user.wallet}`);
  }

  private isAdmin(client: WebSocketClient): boolean {
    return client.user?.role === 'admin';
  }

  private generateClientId(): string {
    return `client_${randomUUID()}`;
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

      if (message.type === 'auth') {
        this.handleAuth(client, message);
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

      if (!client.user) {
        this.sendError(client.id, 'Authenticate first: send {"type":"auth","payload":{"token":"<your login token>"}}');
        return;
      }

      // Handle subscription messages
      if (message.type === 'subscribe') {
        this.handleSubscription(client, message);
        return;
      }

      if (message.type === 'unsubscribe') {
        this.handleUnsubscription(client, message);
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

    // SUPPORT MULTIPLE FORMATS for backward compatibility
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

    // Every channel is a feed of all users' activity (and 'system' exposes
    // server internals), so only admins may subscribe. A normal user still
    // gets their own events, which are sent to their wallet directly.
    if (!this.isAdmin(client)) {
      this.sendError(client.id, 'Only admins can subscribe to activity feeds');
      return;
    }

    channels.forEach((channel: string) => {
      client.subscriptions.add(String(channel));
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
      clearTimeout(client.authTimer);
      logger.info(`WebSocket client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      if (!this.wss) {
        clearInterval(this.heartbeat);
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
    const target = wallet.toLowerCase();
    this.clients.forEach((client) => {
      if (client.user?.wallet === target && client.socket.readyState === WebSocket.OPEN) {
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

  /** Stop the heartbeat and close every connection. */
  close(): Promise<void> {
    clearInterval(this.heartbeat);
    this.clients.forEach((client) => {
      clearTimeout(client.authTimer);
      client.socket.terminate();
    });
    this.clients.clear();
    const wss = this.wss;
    this.wss = null;
    return new Promise((resolve) => (wss ? wss.close(() => resolve()) : resolve()));
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