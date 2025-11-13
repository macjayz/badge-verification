import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface JWTPayload {
  userId: string;
  wallet: string;
}

export class JWTService {
  private readonly secret: string;

  constructor() {
    this.secret = config.server.jwtSecret;
  }

  generateToken(payload: JWTPayload): string {
    if (!payload.userId || !payload.wallet) {
      throw new Error('User ID and wallet are required for JWT generation');
    }

    return jwt.sign(payload, this.secret, { expiresIn: '7d' });
  }

  verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.secret) as JWTPayload;
    } catch (error) {
      logger.error('JWT verification failed:', error);
      return null;
    }
  }
}

export const jwtService = new JWTService();