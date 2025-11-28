// FIXED: src/routes/user-management.routes.ts
import { Router } from 'express';
import { UserManagementController } from '../controllers/user-management.controller'; // Remove the instance import
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require admin authentication
router.use(authenticateToken);

// User management routes - use static methods directly
router.get('/', UserManagementController.getUsers);
router.get('/stats', UserManagementController.getUserStats);
router.get('/:userId', UserManagementController.getUserDetails);
router.patch('/:userId/status', UserManagementController.updateUserStatus);

export { router as userManagementRoutes };