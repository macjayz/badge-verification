// src/routes/user-management.routes.ts
import { Router } from 'express';
import { userManagementController } from '../controllers/user-management.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All user management routes require admin authentication
router.use(authenticateToken);

// User management routes - remove /users prefix since it's already in the mount path
router.get('/', userManagementController.getAllUsers); // /api/admin/users
router.get('/stats', userManagementController.getUserStatistics); // /api/admin/users/stats
router.get('/:userId', userManagementController.getUserDetails); // /api/admin/users/:userId
router.patch('/:userId/status', userManagementController.updateUserStatus); // /api/admin/users/:userId/status

export { router as userManagementRoutes };