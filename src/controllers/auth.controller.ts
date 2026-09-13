import { Request, Response } from 'express';
import { SiweMessage, generateNonce } from 'siwe';
import { ethers } from 'ethers';
import { AppDataSource } from '../db/datasource';
import { User } from '../entities/User';
import { redisService } from '../services/redis.service';
import { jwtService, JWTPayload } from '../services/jwt.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { config } from '../config';

const userRepository = AppDataSource.getRepository(User);

// How long a user has to sign the login message.
const LOGIN_TTL_SECONDS = 5 * 60;

interface PendingLogin {
  nonce: string;
  message: string;
}

const pendingLoginKey = (address: string) => `auth:siwe:${address.toLowerCase()}`;

/**
 * Build the Sign-In with Ethereum message on the server and remember it.
 *
 * The client signs this exact text, so the format is always valid and the
 * domain, nonce and expiry are ours rather than the browser's. Returns null
 * for an invalid address.
 */
async function startLogin(req: Request, rawAddress: unknown) {
  if (typeof rawAddress !== 'string' || !ethers.isAddress(rawAddress)) {
    return null;
  }

  const address = ethers.getAddress(rawAddress); // SIWE requires the checksummed form
  const host = req.get('host') ?? 'localhost';
  const nonce = generateNonce();
  const issuedAt = new Date();

  const message = new SiweMessage({
    domain: host,
    address,
    statement: 'Sign in to Badge Verification.',
    uri: `${req.protocol}://${host}`,
    version: '1',
    chainId: config.web3.defaultChainId,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: new Date(issuedAt.getTime() + LOGIN_TTL_SECONDS * 1000).toISOString(),
  }).prepareMessage();

  const pending: PendingLogin = { nonce, message };
  await redisService.set(pendingLoginKey(address), JSON.stringify(pending), LOGIN_TTL_SECONDS);

  logger.info(`Started wallet login for ${address}`);
  return { address, nonce, message };
}

async function findOrCreateUser(wallet: string): Promise<User> {
  const normalized = wallet.toLowerCase();
  let user = await userRepository.findOne({ where: { wallet: normalized } });

  if (!user) {
    user = userRepository.create({ wallet: normalized });
    await userRepository.save(user);
    logger.info(`Created new user: ${user.wallet}`);
  }

  if (!user.id) {
    user = await userRepository.findOneOrFail({ where: { wallet: normalized } });
  }

  return user;
}

export class AuthController {
  async getNonce(req: Request, res: Response) {
    try {
      const login = await startLogin(req, req.query.wallet);
      if (!login) {
        return res.status(400).json({ error: 'Valid Ethereum address required' });
      }
      res.json({ ...login, expiresIn: '5 minutes' });
    } catch (error) {
      logger.error('Get nonce error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async initAuth(req: Request, res: Response) {
    try {
      const login = await startLogin(req, req.body?.address);
      if (!login) {
        return res.status(400).json({ error: 'Valid Ethereum address required' });
      }
      res.json({ ...login, expiresIn: '5 minutes' });
    } catch (error) {
      logger.error('Init auth error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Finish a wallet login. Succeeds only if the signature was made by the
   * wallet named in the message, over the exact message we issued, for this
   * site, before it expired. Each issued message works once.
   */
  async verifyAuth(req: Request, res: Response) {
    const reject = (reason: string) => {
      logger.warn(`Wallet login rejected: ${reason}`);
      return res.status(401).json({ error: 'Wallet login failed. Please try again.' });
    };

    try {
      const { message, signature } = req.body ?? {};
      if (typeof message !== 'string' || typeof signature !== 'string') {
        return res.status(400).json({ error: 'message and signature are required' });
      }

      let siwe: SiweMessage;
      try {
        siwe = new SiweMessage(message);
      } catch {
        return reject('message is not a valid sign-in message');
      }

      // Consume first, so a message can't be retried even if verification fails.
      const raw = await redisService.getDel(pendingLoginKey(siwe.address));
      if (!raw) {
        return reject(`no pending login for ${siwe.address}`);
      }

      const pending = JSON.parse(raw) as PendingLogin;
      if (pending.message !== message) {
        return reject('message differs from the one issued');
      }

      try {
        await siwe.verify({
          signature,
          nonce: pending.nonce,
          domain: req.get('host'),
          time: new Date().toISOString(),
        });
      } catch (error: any) {
        return reject(error?.error?.type ?? 'signature verification failed');
      }

      const user = await findOrCreateUser(siwe.address);
      const tokenPayload: JWTPayload = { userId: user.id, wallet: user.wallet };
      const token = jwtService.generateToken(tokenPayload);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          wallet: user.wallet
        }
      });

    } catch (error) {
      logger.error('Verify auth error:', error);
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

  /**
   * Demo login: hands out a token for any wallet with no proof of ownership.
   * Handy for local testing, so it exists outside production only.
   */
  async devVerify(req: Request, res: Response) {
    if (config.server.isProduction) {
      return res.status(404).json({ error: 'Demo login is disabled on this server' });
    }

    try {
      const { wallet } = req.body;

      if (!wallet || !ethers.isAddress(wallet)) {
        return res.status(400).json({ error: 'Valid Ethereum address required' });
      }

      const user = await findOrCreateUser(wallet);
      const tokenPayload: JWTPayload = { userId: user.id, wallet: user.wallet };
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
