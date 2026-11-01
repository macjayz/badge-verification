import { Router } from 'express';
import { adminAuthController } from '../controllers/admin-auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', adminAuthController.login);

// Protected routes
router.get('/verify', authenticateToken, adminAuthController.verifyAdmin);
router.post('/logout', authenticateToken, adminAuthController.logout);

export { router as adminAuthRoutes };