import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

// All routes in this file are protected
router.use(authenticateToken);

router.get('/profile', (req: AuthenticatedRequest, res) => {
  res.json({
    message: 'This is a protected route',
    user: req.user
  });
});

router.get('/dashboard', (req: AuthenticatedRequest, res) => {
  res.json({
    message: 'Dashboard data',
    user: req.user,
    stats: {
      verifications: 0,
      badges: 0,
      // Will be populated in later steps
    }
  });
});

export { router as protectedRoutes };