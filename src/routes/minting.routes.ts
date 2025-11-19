// src/routes/minting.routes.ts
import { Router } from 'express';
import { mintingController } from '../controllers/minting.controller';
import { authenticateToken } from '../middleware/auth.middleware'; // CORRECT IMPORT NAME

const router = Router();

// All minting routes require authentication
router.use(authenticateToken);

// Use the controller methods directly (they now use asyncHandler)
router.post('/initiate', mintingController.initiateMint);
router.get('/status/:mintId', mintingController.getMintStatus);
router.get('/user/mints', mintingController.getUserMints);
router.get('/user/badges', mintingController.getActiveBadges);
router.post('/check-eligibility', mintingController.checkMintEligibility);
router.post('/revoke', mintingController.revokeBadge);

export { router as mintingRoutes };