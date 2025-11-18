import { Router } from 'express';
import { eligibilityController } from '../controllers/eligibility.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/:wallet', eligibilityController.checkEligibility);
router.get('/:wallet/all', eligibilityController.checkAllEligibilities);

// Protected routes (user checks their own eligibility)
router.get('/', authenticateToken, eligibilityController.checkUserEligibility);

export { router as eligibilityRoutes };