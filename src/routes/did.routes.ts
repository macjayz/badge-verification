// src/routes/did.routes.ts
import { Router } from 'express';
import { didController } from '../controllers/did.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Health and status endpoints (public)
router.get('/providers', didController.getAvailableProviders);
router.get('/health', didController.getAllProvidersHealth);
router.get('/health/:provider', didController.getProviderHealth);
router.get('/system-status', didController.getSystemStatus);
router.get('/adapters/:provider', didController.getAdapterDetails);

// Verification endpoints (protected)
router.post('/:provider/init', authenticateToken, didController.initiateVerification);
router.post('/:provider/callback', didController.handleCallback);
router.get('/status', authenticateToken, didController.getVerificationStatus);
router.get('/session/:sessionId', didController.getVerificationSession);

export { router as didRoutes };