import { Router } from 'express';
import { issuerController } from '../controllers/issuer.controller';
import { authenticateApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// Public routes (no API key required)
router.post('/register', issuerController.registerIssuer);

// Protected routes (require API key authentication)
router.use(authenticateApiKey);

router.get('/profile', issuerController.getIssuerProfile);
router.post('/badges', issuerController.createBadgeType);
router.get('/badges', issuerController.getIssuerBadges);
router.patch('/badges/:badgeTypeId', issuerController.updateBadgeType);
router.post('/rotate-api-key', issuerController.rotateApiKey);

export { router as issuerRoutes };