// src/routes/discord-verification.routes.ts
import { Router } from 'express';
import { discordVerificationController } from '../controllers/discord-verification.controller';
import { authenticateToken, requireOwnWallet } from '../middleware/auth.middleware';

const router = Router();

// Starting a login requires a signed-in wallet; the login is bound to it.
router.post('/oauth/initiate', authenticateToken, discordVerificationController.initiateOAuth);

// GET: the provider redirects the popup here (no session available).
// POST: the app page sends code/state on; must be the same signed-in wallet.
router.get('/callback', discordVerificationController.handleCallback);
router.post('/callback', authenticateToken, discordVerificationController.handleCallback);

// Make status endpoint public
router.get('/status/:wallet', discordVerificationController.getConnectionStatus);

// Protected route: only for the signed-in wallet.
// verifyServerMembership uses `this`, so it must stay bound to the controller.
router.post(
  '/verify-membership',
  authenticateToken,
  requireOwnWallet,
  discordVerificationController.verifyServerMembership.bind(discordVerificationController)
);

export { router as discordVerificationRoutes };