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
router.get('/verifications', UserController.getUserVerifications);
router.get('/achievements', UserController.getAchievements);
router.post('/achievements/initialize', UserController.initializeAchievements);

// Badge minting endpoints
router.post('/mint-badge', UserController.mintBadge);
router.post('/check-eligibility', UserController.checkEligibility);

// Issuer-specific routes
router.get('/issuers', UserController.getUserIssuers);
router.get('/issuer/:issuerId/requirements', UserController.getIssuerVerificationRequirements);
router.get('/issuer/:issuerId/eligibility', UserController.checkIssuerEligibility);
router.get('/issuer/:issuerId/status', UserController.getIssuerVerificationStatus);

export default router;