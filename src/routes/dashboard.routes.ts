// src/routes/dashboard.routes.ts
import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// ALL dashboard routes now require authentication
router.use(authenticateToken);

// Protected routes
router.get('/stats', dashboardController.getIssuerDashboard);
router.get('/performance', dashboardController.getBadgePerformance);
router.get('/holders', dashboardController.getBadgeHolders);
router.get('/analytics/verifications', dashboardController.getVerificationAnalytics);

// Admin Dashboard Routes
router.use('/admin', requireAdmin);
router.get('/admin/stats', dashboardController.getAdminStats);
router.get('/admin/recent-mints', dashboardController.getRecentMints);
router.get('/admin/users', dashboardController.getUserManagement);
router.get('/admin/badge-analytics', dashboardController.getBadgeAnalytics);
router.get('/admin/system-health', dashboardController.getSystemHealth);
router.get('/admin/minting-activity', dashboardController.getMintingActivity);
router.get('/admin/debug-db', dashboardController.debugDatabase);

export { router as dashboardRoutes };