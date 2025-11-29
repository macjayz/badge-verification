// src/routes/issuer-dashboard.routes.ts
import { Router } from 'express';
import { issuerDashboardController } from '../controllers/issuer-dashboard.controller';
import { authenticateApiKey } from '../middleware/apiKey.middleware'; // FIXED IMPORT

const router = Router();

// All routes require API key authentication
router.use(authenticateApiKey); // FIXED: Use authenticateApiKey

// Profile management
router.post('/profile', issuerDashboardController.createProfile);
router.get('/profile', issuerDashboardController.getProfile);
router.patch('/profile', issuerDashboardController.updateProfile);

// Social rules management
router.post('/social-rules', issuerDashboardController.createSocialRule);
router.get('/social-rules', issuerDashboardController.getSocialRules);
router.patch('/social-rules/:ruleId', issuerDashboardController.updateSocialRule);
router.delete('/social-rules/:ruleId', issuerDashboardController.deleteSocialRule);

// Dashboard data
router.get('/stats', issuerDashboardController.getDashboardStats);
router.get('/rule-templates', issuerDashboardController.getRuleTemplates);
router.get('/generate-badge-rules', issuerDashboardController.generateBadgeRules);

export { router as issuerDashboardRoutes };