// src/routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

// User profile and data
router.get('/profile', UserController.getProfile);
router.get('/badges', UserController.getUserBadges);
router.get('/available-badges', UserController.getAvailableBadges);
router.get('/activity', UserController.getUserActivity);

// NEW: Badge minting endpoints
router.post('/mint-badge', UserController.mintBadge);
router.post('/check-eligibility', UserController.checkEligibility);
router.post('/complete-verification', UserController.completeVerification);

export default router;