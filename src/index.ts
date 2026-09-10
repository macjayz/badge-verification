// src/index.ts
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config, assertProductionConfig } from './config';
import { initializeDatabase } from './db/datasource';
import { webSocketService } from './services/websocket.service';
import authRoutes from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';
import { protectedRoutes } from './routes/protected.routes';
import { didRoutes } from './routes/did.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { issuerRoutes } from './routes/issuer.routes';
import { eligibilityRoutes } from './routes/eligibility.routes';
import { mintingRoutes } from './routes/minting.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { adminAuthRoutes } from './routes/admin-auth.routes';
import { errorHandler } from './middleware/error.middleware';
import { userManagementRoutes } from './routes/user-management.routes';
import { badgeManagementRoutes } from './routes/badge-management.routes';
import { twitterVerificationRoutes } from './routes/twitter-verification.routes';
import userRoutes from './routes/user.routes';
import { issuerDashboardRoutes } from './routes/issuer-dashboard.routes'; 
import { discordVerificationRoutes } from './routes/discord-verification.routes';
import snapshotVerificationRoutes from './routes/snapshot-verification.routes';
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

app.use('/api/user', userRoutes);

app.use('/public', (req, res, next) => {
  console.log('Static file request:', req.path);
  next();
});
app.use('/public', express.static(path.join(__dirname, '../public')));

app.get('/user-management', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/user-management.html'));
});

app.get('/user-management.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/user-management.html'));
});

// Initialize WebSocket server
webSocketService.initialize(server);

// Start demo events in development mode
// DEMO EVENTS DISABLED - Comment out or remove the following block:
// if (config.server.nodeEnv === 'development') {
//   setTimeout(() => {
//     webSocketEventsService.startDemoEvents();
//     logger.info('🎪 WebSocket demo events started');
//   }, 3000);
// }

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/did', didRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/issuer', issuerRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/minting', mintingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', userManagementRoutes);
app.use('/api/admin/badges', badgeManagementRoutes);
app.use('/api/verify/twitter', twitterVerificationRoutes);
app.use('/api/verify/discord', discordVerificationRoutes);
app.use('/api/verify/snapshot', snapshotVerificationRoutes);
app.use('/api/issuer-dashboard', issuerDashboardRoutes);
app.use('/', healthRoutes);

// HTML Page Routes
app.get('/websocket-demo', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/websocket-demo.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/admin-login', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/admin-login.html'));
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

app.get('/admin-login.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/admin-login.html'));
});

app.get('/badge-management', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/badge-management.html'));
});

app.get('/badge-management.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/badge-management.html'));
});

// Issuer Dashboard HTML Routes (ADD ALL THESE)
app.get('/issuer-dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-dashboard.html'));
});

app.get('/issuer-dashboard.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-dashboard.html'));
});

app.get('/issuer-onboarding', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-onboarding.html'));
});

app.get('/issuer-onboarding.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-onboarding.html'));
});

app.get('/issuer-badge-creator', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-badge-creator.html'));
});

app.get('/issuer-badge-creator.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-badge-creator.html'));
});

app.get('/issuer-analytics', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-analytics.html'));
});

app.get('/issuer-analytics.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-analytics.html'));
});

app.get('/issuer-social-rules', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-social-rules.html'));
});

app.get('/issuer-social-rules.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-social-rules.html'));
});

app.get('/issuer-settings', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-settings.html'));
});

app.get('/issuer-settings.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-settings.html'));
});

app.get('/issuer-login', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-login.html'));
});

app.get('/issuer-login.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, '../public/issuer-login.html'));
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
  // if (config.server.nodeEnv === 'development') {
  //   webSocketEventsService.stopDemoEvents();
  // }
  
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
    // Fail fast if production is still running on development credentials
    assertProductionConfig();

    // Initialize database
    await initializeDatabase();

    // Start server
    server.listen(config.server.port, () => {
      logger.info(`🚀 Server running on port ${config.server.port}`);
      logger.info(`🔌 WebSocket server available at ws://localhost:${config.server.port}/ws`);
      logger.info(`📊 WebSocket demo available at http://localhost:${config.server.port}/websocket-demo`);
      logger.info(`📈 Admin dashboard available at http://localhost:${config.server.port}/admin-dashboard`);
      logger.info(`🔐 Admin login available at http://localhost:${config.server.port}/admin-login`);
      logger.info(`🏢 Issuer dashboard available at http://localhost:${config.server.port}/issuer-dashboard`); // ADD THIS
      logger.info(`🚀 Issuer login available at http://localhost:${config.server.port}/issuer-login`); // ADD THIS
      logger.info(`🪙 Issuer badge creator available at http://localhost:${config.server.port}/issuer-badge-creator`); // ADD THIS
      logger.info(`📈 Issuer analytics available at http://localhost:${config.server.port}/issuer-analytics`); // ADD THIS
      logger.info(`🔗 Issuer social rules available at http://localhost:${config.server.port}/issuer-social-rules`); // ADD THIS
      logger.info(`⚙️ Issuer settings available at http://localhost:${config.server.port}/issuer-settings`); // ADD THIS
      logger.info(`🌐 Environment: ${config.server.nodeEnv}`);
      logger.info(`🔒 Allowed origins: ${config.server.allowedOrigins.join(', ')}`);
      logger.info(`📡 Health check: http://localhost:${config.server.port}/health`);
      logger.info(`🔑 Auth endpoints: http://localhost:${config.server.port}/api/auth`);
      logger.info(`🛡️ Protected endpoints: http://localhost:${config.server.port}/api/protected`);
      logger.info(`🆔 DID endpoints: http://localhost:${config.server.port}/api/did`);
      logger.info(`🎯 Eligibility endpoints: http://localhost:${config.server.port}/api/eligibility`);
      logger.info(`🪙 Minting endpoints: http://localhost:${config.server.port}/api/minting`);
      logger.info(`📈 Dashboard endpoints: http://localhost:${config.server.port}/api/dashboard`);
      logger.info(`🔐 Admin auth endpoints: http://localhost:${config.server.port}/api/admin/auth`);
      logger.info(`🔑 Issuer dashboard endpoints: http://localhost:${config.server.port}/api/issuer-dashboard`); // ADD THIS
      logger.info(`✅ Enhanced error handling: ACTIVE`);
      logger.info(`🔔 WebSocket real-time updates: ACTIVE`);
      logger.info(`🔐 Admin authentication: ENABLED`);
      logger.info(`👥 User management endpoints: http://localhost:${config.server.port}/api/admin/users`);
      logger.info(`🪙 Badge management available at http://localhost:${config.server.port}/badge-management`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();