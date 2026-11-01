import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Issuer dashboards live under /api/issuer-dashboard; these are the admin views.
router.use(authenticateToken);

router.use('/admin', requireAdmin);
router.get('/admin/stats', dashboardController.getAdminStats);
router.get('/admin/recent-mints', dashboardController.getRecentMints);
router.get('/admin/users', dashboardController.getUserManagement);
router.get('/admin/badge-analytics', dashboardController.getBadgeAnalytics);
router.get('/admin/system-health', dashboardController.getSystemHealth);
router.get('/admin/minting-activity', dashboardController.getMintingActivity);

export { router as dashboardRoutes };