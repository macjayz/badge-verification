import { Request, Response } from 'express';
import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { redisService } from '../services/redis.service';
import { jwtService, JWTPayload } from '../services/jwt.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const userRepository = AppDataSource.getRepository(User);

export class AuthController {
  async initAuth(req: Request, res: Response) {
    try {
      const { address } = req.body;
      
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ error: 'Valid Ethereum address required' });
      }

      // Generate cryptographically secure nonce
      const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Store nonce in Redis with 5-minute expiry
      await redisService.set(`auth:nonce:${address.toLowerCase()}`, nonce, 300);

      logger.info(`Generated nonce for address: ${address}`);
      
      res.json({ 
        nonce,
        expiresIn: '5 minutes'
      });
    } catch (error) {
      logger.error('Init auth error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async verifyAuth(req: Request, res: Response) {
    try {
      const { message, signature } = req.body;

      if (!message || !signature) {
        return res.status(400).json({ error: 'Message and signature required' });
      }

      // Verify SIWE message
      const siweMessage = new SiweMessage(message);
      const { data: verifiedMessage } = await siweMessage.verify({ 
        signature,
        time: new Date().toISOString()
      });

      // Check nonce
      const storedNonce = await redisService.get(`auth:nonce:${verifiedMessage.address.toLowerCase()}`);
      if (!storedNonce || storedNonce !== verifiedMessage.nonce) {
        return res.status(401).json({ error: 'Invalid or expired nonce' });
      }

      // Clean up used nonce
      await redisService.del(`auth:nonce:${verifiedMessage.address.toLowerCase()}`);

      // Upsert user - FIXED: Use userRepository.create() instead of constructor
      let user = await userRepository.findOne({
        where: { wallet: verifiedMessage.address.toLowerCase() }
      });

      if (!user) {
        user = userRepository.create({
          wallet: verifiedMessage.address.toLowerCase()
        });
        await userRepository.save(user);
        logger.info(`Created new user: ${user.wallet}`);
      } else {
        logger.info(`User authenticated: ${user.wallet}`);
      }

      // Generate JWT token - Add null check for user.id
      if (!user.id) {
        // Refresh the user object to get the generated ID
        user = await userRepository.findOneOrFail({
          where: { wallet: verifiedMessage.address.toLowerCase() }
        });
      }

      const tokenPayload: JWTPayload = {
        userId: user.id,
        wallet: user.wallet
      };

      const token = jwtService.generateToken(tokenPayload);

      // Store session in Redis (optional, for session management)
      await redisService.set(`session:${user.id}`, token, 7 * 24 * 60 * 60); // 7 days

      res.json({
        success: true,
        token,
        tokenType: 'Bearer',
        expiresIn: '7 days',
        user: {
          id: user.id,
          wallet: user.wallet,
          did: user.did,
          createdAt: user.createdAt
        }
      });

    } catch (error) {
      logger.error('Verify auth error:', error);
      if (error instanceof Error) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          details: error.message 
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getAuthStatus(req: Request, res: Response) {
    try {
      const { wallet } = req.params;
      
      const user = await userRepository.findOne({
        where: { wallet: wallet.toLowerCase() }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        authenticated: true,
        user: {
          id: user.id,
          wallet: user.wallet,
          did: user.did,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      logger.error('Get auth status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCurrentUser(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await userRepository.findOne({
        where: { id: req.user.userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        user: {
          id: user.id,
          wallet: user.wallet,
          did: user.did,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async logout(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Remove session from Redis
      await redisService.del(`session:${req.user.userId}`);

      logger.info(`User logged out: ${req.user.wallet}`);

      res.json({
        success: true,
        message: 'Successfully logged out'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Keep the dev verify for testing - FIXED: Remove constructor usage
  async devVerify(req: Request, res: Response) {
    try {
      const { wallet } = req.body;
      
      if (!wallet || !ethers.isAddress(wallet)) {
        return res.status(400).json({ error: 'Valid Ethereum address required' });
      }

      // For development only - skip actual SIWE verification
      let user = await userRepository.findOne({
        where: { wallet: wallet.toLowerCase() }
      });

      if (!user) {
        user = userRepository.create({
          wallet: wallet.toLowerCase()
        });
        await userRepository.save(user);
        logger.info(`[DEV] Created new user: ${user.wallet}`);
      }

      // Ensure we have the user ID
      if (!user.id) {
        user = await userRepository.findOneOrFail({
          where: { wallet: wallet.toLowerCase() }
        });
      }

      // Generate proper JWT token
      const tokenPayload: JWTPayload = {
        userId: user.id,
        wallet: user.wallet
      };

      const token = jwtService.generateToken(tokenPayload);

      res.json({
        token,
        tokenType: 'Bearer',
        expiresIn: '7 days',
        user: {
          id: user.id,
          wallet: user.wallet,
          did: user.did,
          createdAt: user.createdAt
        },
        note: "This is a development-only endpoint"
      });

    } catch (error) {
      logger.error('Dev verify error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const authController = new AuthController();