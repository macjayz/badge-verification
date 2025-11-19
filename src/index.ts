// src/index.ts - UPDATE THIS SECTION
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
import { mintingRoutes } from './routes/minting.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { errorHandler } from './middleware/error.middleware'; // ADD THIS IMPORT
import { logger } from './utils/logger';

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
app.use('/api/minting', mintingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/health', healthRoutes);

// ADD ERROR HANDLER MIDDLEWARE (must be after all routes)
app.use(errorHandler);

// 404 handler (must be after error handler)
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
      suggestion: 'Check the API documentation for available endpoints'
    }
  });
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
      logger.info(`Enhanced error handling: ACTIVE`);
      // ... rest of your logging
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();