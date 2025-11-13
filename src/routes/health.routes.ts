import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Badge Verification Backend',
    version: '1.0.0'
  });
});

export { router as healthRoutes };