// src/routes/twitter-verification.routes.ts
import { Router } from 'express';
import { twitterVerificationController } from '../controllers/twitter-verification.controller';

const router = Router();

// Public routes for OAuth flow
router.post('/oauth/initiate', twitterVerificationController.initiateOAuth);

// ADD BOTH GET AND POST FOR CALLBACK
router.get('/callback', twitterVerificationController.handleCallback);
router.post('/callback', twitterVerificationController.handleCallback);

// Make status endpoint public
router.get('/status/:wallet', twitterVerificationController.getConnectionStatus);

// Protected routes (require authentication)
router.post('/disconnect', twitterVerificationController.disconnect);
router.post('/verify-follow', twitterVerificationController.verifyFollow);

export { router as twitterVerificationRoutes };