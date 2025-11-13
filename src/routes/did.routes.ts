import { Router } from 'express';
import { didController } from '../controllers/did.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/providers', didController.getAvailableProviders);
router.get('/session/:sessionId', didController.getVerificationSession);

// Callback routes (called by DID providers)
router.post('/:provider/callback', didController.handleCallback);

// Protected routes (require authentication)
router.get('/status', authenticateToken, didController.getVerificationStatus);
router.get('/status/:wallet', optionalAuth, didController.getVerificationStatus);
router.post('/:provider/init', authenticateToken, didController.initiateVerification);

export { router as didRoutes };