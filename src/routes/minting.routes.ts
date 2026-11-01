import { Router } from 'express';
import { mintingController } from '../controllers/minting.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// All minting routes require authentication
router.use(authenticateToken);

router.post('/initiate', mintingController.initiateMint);
router.get('/status/:mintId', mintingController.getMintStatus);
router.get('/user/mints', mintingController.getUserMints);
router.get('/user/badges', mintingController.getActiveBadges);
router.post('/check-eligibility', mintingController.checkMintEligibility);
// Revoking a badge is an administrative action, not something a holder can do to anyone's badge.
router.post('/revoke', requireAdmin, mintingController.revokeBadge);

export { router as mintingRoutes };