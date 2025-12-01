// src/routes/discord-verification.routes.ts
import { Router } from 'express';
import { discordVerificationController } from '../controllers/discord-verification.controller';

const router = Router();

// Public routes for OAuth flow
router.post('/oauth/initiate', discordVerificationController.initiateOAuth);

// ADD BOTH GET AND POST FOR CALLBACK
router.get('/callback', discordVerificationController.handleCallback);
router.post('/callback', discordVerificationController.handleCallback);

// Make status endpoint public
router.get('/status/:wallet', discordVerificationController.getConnectionStatus);

// Protected routes (require authentication)
router.post('/verify-membership', discordVerificationController.verifyServerMembership);

export { router as discordVerificationRoutes };