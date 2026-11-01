import { Router } from 'express';
import { badgeManagementController } from '../controllers/badge-management.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// All badge management routes require admin authentication
router.use(authenticateToken, requireAdmin);

// Badge management routes
router.get('/types', badgeManagementController.getAllBadgeTypes);
router.post('/types', badgeManagementController.createBadgeType);
router.get('/types/:badgeTypeId', badgeManagementController.getBadgeAnalytics);
router.put('/types/:badgeTypeId', badgeManagementController.updateBadgeType);
router.patch('/types/:badgeTypeId/eligibility', badgeManagementController.updateEligibilityRules);
router.patch('/types/:badgeTypeId/status', badgeManagementController.toggleBadgeStatus);

export { router as badgeManagementRoutes };