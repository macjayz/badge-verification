// File: src/routes/dashboard.routes.ts
import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Protected routes (require authentication)
router.get('/stats', authenticateToken, dashboardController.getIssuerDashboard);
router.get('/performance', authenticateToken, dashboardController.getBadgePerformance);
router.get('/holders', authenticateToken, dashboardController.getBadgeHolders);
router.get('/analytics/verifications', authenticateToken, dashboardController.getVerificationAnalytics);

// NEW: Admin Dashboard Routes - Use optionalAuth for testing
router.get('/admin/stats', optionalAuth, dashboardController.getAdminStats);
router.get('/admin/recent-mints', optionalAuth, dashboardController.getRecentMints);
router.get('/admin/users', optionalAuth, dashboardController.getUserManagement);
router.get('/admin/badge-analytics', optionalAuth, dashboardController.getBadgeAnalytics);
router.get('/admin/system-health', optionalAuth, dashboardController.getSystemHealth);
router.get('/admin/minting-activity', optionalAuth, dashboardController.getMintingActivity);
router.get('/admin/debug-db', optionalAuth, dashboardController.debugDatabase);

export { router as dashboardRoutes };