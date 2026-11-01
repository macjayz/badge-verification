import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { authenticateApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// An issuer manages only its own webhook, identified by its API key.
router.use(authenticateApiKey);

router.post('/register', webhookController.registerWebhook);
router.get('/list', webhookController.listWebhooks);

export { router as webhookRoutes };
