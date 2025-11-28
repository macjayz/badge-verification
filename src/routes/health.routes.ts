// src/routes/health.routes.ts
import { Router } from 'express';

const router = Router();

// Handle both /health and /health/
router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Badge Verification Backend',
    version: '1.0.0'
  });
});

// Add explicit /health route
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Badge Verification Backend',
    version: '1.0.0'
  });
});

export { router as healthRoutes };