// src/controllers/admin-auth.controller.ts
import { Request, Response } from 'express';
import { jwtService } from '../services/jwt.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { config } from '../config';

// Admin credentials come from ADMIN_USERNAME / ADMIN_PASSWORD. In development
// they fall back to admin/admin123; production refuses to boot unless they are
// overridden (see assertProductionConfig in src/config).
const ADMIN_CREDENTIALS = {
  username: config.admin.username,
  password: config.admin.password,
  role: 'admin'
};

export class AdminAuthController {
  async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password required'
        });
      }

      // Simple credential check (replace with proper auth in production)
      if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Generate admin JWT token
      const token = jwtService.generateToken({
        userId: 'admin',
        wallet: 'admin_dashboard',
        role: 'admin'
      });

      logger.info('Admin login successful');

      res.json({
        success: true,
        token,
        user: {
          username: ADMIN_CREDENTIALS.username,
          role: ADMIN_CREDENTIALS.role
        }
      });

    } catch (error) {
      logger.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  }

  async verifyAdmin(req: AuthenticatedRequest, res: Response) {
    try {
      // Check if user has admin role
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      res.json({
        success: true,
        user: {
          username: ADMIN_CREDENTIALS.username,
          role: ADMIN_CREDENTIALS.role
        }
      });

    } catch (error) {
      logger.error('Admin verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Verification failed'
      });
    }
  }

  async logout(req: Request, res: Response) {
    // JWT is stateless, so client just needs to discard the token
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}

export const adminAuthController = new AdminAuthController();