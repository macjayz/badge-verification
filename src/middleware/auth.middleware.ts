import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwt.service';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    wallet: string;
    role?: string; // Added for admin support
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const payload = jwtService.verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    userId: payload.userId,
    wallet: payload.wallet,
    role: payload.role
  };

  next();
};

/**
 * Use after authenticateToken. Only tokens issued by the admin login carry
 * role 'admin'; a normal wallet login does not.
 */
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

/**
 * Use after authenticateToken on routes that act on "your" wallet. A wallet in
 * the body must be the signed-in one, and is then replaced with it, so the
 * handler can keep reading req.body.wallet without trusting the client.
 */
export const requireOwnWallet = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const signedIn = req.user?.wallet?.toLowerCase();
  if (!signedIn) {
    return res.status(401).json({ success: false, error: 'Sign in with your wallet first' });
  }

  const claimed = req.body?.wallet;
  if (claimed !== undefined && String(claimed).toLowerCase() !== signedIn) {
    return res.status(403).json({ success: false, error: 'Wallet does not match the signed-in user' });
  }

  req.body = { ...(req.body ?? {}), wallet: signedIn };
  next();
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const payload = jwtService.verifyToken(token);
    if (payload) {
      req.user = {
        userId: payload.userId,
        wallet: payload.wallet,
        role: payload.role
      };
    }
  }

  next();
};