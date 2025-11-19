import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Protected routes (require authentication)
router.get('/stats', authenticateToken, dashboardController.getIssuerDashboard);
router.get('/performance', authenticateToken, dashboardController.getBadgePerformance);
router.get('/holders', authenticateToken, dashboardController.getBadgeHolders);
router.get('/analytics/verifications', authenticateToken, dashboardController.getVerificationAnalytics);

export { router as dashboardRoutes };