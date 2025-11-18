import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initializeDatabase } from './db/datasource';
import { authRoutes } from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';
import { protectedRoutes } from './routes/protected.routes';
import { didRoutes } from './routes/did.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { issuerRoutes } from './routes/issuer.routes';
import { eligibilityRoutes } from './routes/eligibility.routes';
import { logger } from './utils/logger'; // FIXED: Remove the extra ../

const app = express();

// Middleware
app.use(cors({
  origin: config.server.allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/did', didRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/issuer', issuerRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/health', healthRoutes);

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    // Start server
    app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.server.port}/health`);
      logger.info(`Auth endpoints: http://localhost:${config.server.port}/api/auth`);
      logger.info(`Protected endpoints: http://localhost:${config.server.port}/api/protected`);
      logger.info(`DID endpoints: http://localhost:${config.server.port}/api/did`);
      logger.info(`Webhook endpoints: http://localhost:${config.server.port}/api/webhooks`);
      logger.info(`Issuer endpoints: http://localhost:${config.server.port}/api/issuer`);
      logger.info(`Eligibility endpoints: http://localhost:${config.server.port}/api/eligibility`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();