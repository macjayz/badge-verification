import { Router } from 'express';
import { snapshotVerificationController } from '../controllers/snapshot-verification.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/spaces/:wallet', snapshotVerificationController.getSpaces);
router.get('/history/:wallet', snapshotVerificationController.getVoteHistory);

// Protected routes (require authentication)
router.use(authenticateToken);
router.post('/initiate', snapshotVerificationController.initiateVerification);
router.post('/verify', snapshotVerificationController.verifyWallet);
router.post('/check', snapshotVerificationController.checkRequirements);

export default router;