import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

// Public routes for webhook registration
router.post('/register', webhookController.registerWebhook);
router.get('/list', webhookController.listWebhooks);

export { router as webhookRoutes };