import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/init', authController.initAuth);
router.post('/verify', authController.verifyAuth);
router.post('/dev-verify', authController.devVerify); // Keep for development
router.get('/status/:wallet', authController.getAuthStatus);
router.get('/me', authenticateToken, authController.getCurrentUser);
router.post('/logout', authenticateToken, authController.logout);

export { router as authRoutes };