import { Router } from 'express';
import UserController from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

router.get('/profile', UserController.getProfile);
router.get('/badges', UserController.getUserBadges);
router.get('/available-badges', UserController.getAvailableBadges);
router.get('/activity', UserController.getUserActivity);

export default router;