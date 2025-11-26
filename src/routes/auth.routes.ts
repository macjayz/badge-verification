import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/init', authController.initAuth);
router.post('/verify', authController.verifyAuth);
router.post('/dev-verify', authController.devVerify);
router.get('/status/:wallet', authController.getAuthStatus);

// Protected routes (require authentication)
router.get('/verify-token', authenticateToken, authController.getCurrentUser);
router.post('/logout', authenticateToken, authController.logout);

export default router;