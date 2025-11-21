// src/index.ts
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { initializeDatabase } from './db/datasource';
import { webSocketService } from './services/websocket.service';
import { webSocketEventsService } from './services/websocket-events.service';
import { authRoutes } from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';
import { protectedRoutes } from './routes/protected.routes';
import { didRoutes } from './routes/did.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { issuerRoutes } from './routes/issuer.routes';
import { eligibilityRoutes } from './routes/eligibility.routes';
import { mintingRoutes } from './routes/minting.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import path from 'path';

const app = express();
const server = createServer(app);

// Middleware
app.use(cors({
  origin: config.server.allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Add this right after your static file configuration
app.use('/public', (req, res, next) => {
  console.log('Static file request:', req.path);
  next();
});
app.use('/public', express.static(path.join(__dirname, '../public')));

// Initialize WebSocket server
webSocketService.initialize(server);

// Start demo events in development mode
if (config.server.nodeEnv === 'development') {
  setTimeout(() => {
    webSocketEventsService.startDemoEvents();
    logger.info('🎪 WebSocket demo events started');
  }, 3000);
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/did', didRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/issuer', issuerRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/minting', mintingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/health', healthRoutes);

// HTML Page Routes - FIXED VERSION
app.get('/websocket-demo', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/websocket-demo.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// Direct file access routes
app.get('/websocket-demo.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/websocket-demo.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// Global error handler middleware (must be after all routes)
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

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, starting graceful shutdown');
  gracefulShutdown();
});

function gracefulShutdown() {
  logger.info('Starting graceful shutdown...');
  
  // Stop demo events
  if (config.server.nodeEnv === 'development') {
    webSocketEventsService.stopDemoEvents();
  }
  
  server.close((err) => {
    if (err) {
      logger.error('Error closing server:', err);
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    process.exit(0);
  });
}

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    // Start server
    server.listen(config.server.port, () => {
      logger.info(`🚀 Server running on port ${config.server.port}`);
      logger.info(`🔌 WebSocket server available at ws://localhost:${config.server.port}/ws`);
      logger.info(`📊 WebSocket demo available at http://localhost:${config.server.port}/websocket-demo`);
      logger.info(`📈 Admin dashboard available at http://localhost:${config.server.port}/admin-dashboard`);
      logger.info(`🌐 Environment: ${config.server.nodeEnv}`);
      logger.info(`🔒 Allowed origins: ${config.server.allowedOrigins.join(', ')}`);
      logger.info(`📡 Health check: http://localhost:${config.server.port}/health`);
      logger.info(`🔑 Auth endpoints: http://localhost:${config.server.port}/api/auth`);
      logger.info(`🛡️ Protected endpoints: http://localhost:${config.server.port}/api/protected`);
      logger.info(`🆔 DID endpoints: http://localhost:${config.server.port}/api/did`);
      logger.info(`🎯 Eligibility endpoints: http://localhost:${config.server.port}/api/eligibility`);
      logger.info(`🪙 Minting endpoints: http://localhost:${config.server.port}/api/minting`);
      logger.info(`📈 Dashboard endpoints: http://localhost:${config.server.port}/api/dashboard`);
      logger.info(`✅ Enhanced error handling: ACTIVE`);
      logger.info(`🔔 WebSocket real-time updates: ACTIVE`);
      if (config.server.nodeEnv === 'development') {
        logger.info(`🎪 Demo events: ACTIVE (random minting events every 5-15 seconds)`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();