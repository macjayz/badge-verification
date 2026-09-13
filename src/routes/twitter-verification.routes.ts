// src/routes/twitter-verification.routes.ts
import { Router } from 'express';
import { twitterVerificationController } from '../controllers/twitter-verification.controller';
import { authenticateToken, requireOwnWallet } from '../middleware/auth.middleware';

const router = Router();

// Starting a login requires a signed-in wallet; the login is bound to it.
router.post('/oauth/initiate', authenticateToken, twitterVerificationController.initiateOAuth);

// GET: the provider redirects the popup here (no session available).
// POST: the app page sends code/state on; must be the same signed-in wallet.
router.get('/callback', twitterVerificationController.handleCallback);
router.post('/callback', authenticateToken, twitterVerificationController.handleCallback);

// Make status endpoint public
router.get('/status/:wallet', twitterVerificationController.getConnectionStatus);

// Protected routes: only for the signed-in wallet.
// verifyFollow uses `this`, so it must stay bound to the controller.
router.post('/disconnect', authenticateToken, requireOwnWallet, twitterVerificationController.disconnect);
router.post(
  '/verify-follow',
  authenticateToken,
  requireOwnWallet,
  twitterVerificationController.verifyFollow.bind(twitterVerificationController)
);

export { router as twitterVerificationRoutes };