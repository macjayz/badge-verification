import { Request, Response, NextFunction } from 'express';
import { issuerService } from '../services/issuer.service';
import { logger } from '../utils/logger';

export interface AuthenticatedIssuerRequest extends Request {
  issuer?: {
    id: string;
    name: string;
    wallet: string;
  };
}

export const authenticateApiKey = async (
  req: AuthenticatedIssuerRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }

    const issuer = await issuerService.getIssuerByApiKey(apiKey);
    
    if (!issuer) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    if (!issuer.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Issuer account is inactive'
      });
    }

    req.issuer = {
      id: issuer.id,
      name: issuer.name,
      wallet: issuer.wallet
    };

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};