import { Router } from 'express';
import { AppDataSource } from '../db/datasource';

const router = Router();

// Load balancers and orchestrators poll this. It answers 503 until the database is reachable.
router.get('/health', async (_req, res) => {
  let database = false;
  try {
    database = AppDataSource.isInitialized && (await AppDataSource.query('SELECT 1')).length === 1;
  } catch {
    database = false;
  }

  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'unavailable',
    database: database ? 'up' : 'down',
    timestamp: new Date().toISOString()
  });
});

export { router as healthRoutes };
