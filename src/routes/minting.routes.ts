import { Router } from 'express';
import { mintingController } from '../controllers/minting.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Protected routes (require authentication)
router.post('/initiate', authenticateToken, mintingController.initiateMint);
router.post('/check-eligibility', authenticateToken, mintingController.checkMintEligibility);
router.get('/user/mints', authenticateToken, mintingController.getUserMints);
router.get('/user/badges', authenticateToken, mintingController.getActiveBadges);
router.get('/status/:mintId', mintingController.getMintStatus);
router.post('/revoke', authenticateToken, mintingController.revokeBadge);

export { router as mintingRoutes };