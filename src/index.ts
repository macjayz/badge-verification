import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { config, assertProductionConfig } from './config';
import { AppDataSource, initializeDatabase } from './db/datasource';
import { webSocketService } from './services/websocket.service';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import snapshotVerificationRoutes from './routes/snapshot-verification.routes';
import { healthRoutes } from './routes/health.routes';
import { protectedRoutes } from './routes/protected.routes';
import { didRoutes } from './routes/did.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { issuerRoutes } from './routes/issuer.routes';
import { eligibilityRoutes } from './routes/eligibility.routes';
import { mintingRoutes } from './routes/minting.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { adminAuthRoutes } from './routes/admin-auth.routes';
import { userManagementRoutes } from './routes/user-management.routes';
import { badgeManagementRoutes } from './routes/badge-management.routes';
import { twitterVerificationRoutes } from './routes/twitter-verification.routes';
import { discordVerificationRoutes } from './routes/discord-verification.routes';
import { issuerDashboardRoutes } from './routes/issuer-dashboard.routes';

const PUBLIC_DIR = path.join(__dirname, '../public');

// Pages served at a clean URL as well as at /<page>.html.
const PAGES = [
  'user-login', 'user-dashboard', 'user-profile', 'user-badges', 'user-verifications',
  'achievements', 'badge-gallery', 'badge-analytics',
  'admin-login', 'admin-dashboard', 'user-management', 'badge-management',
  'issuer-login', 'issuer-onboarding', 'issuer-dashboard', 'issuer-badge-creator',
  'issuer-analytics', 'issuer-social-rules', 'issuer-settings'
];

const app = express();
const server = createServer(app);

// Behind a reverse proxy (Render, Railway, nginx) the client IP is in X-Forwarded-For.
app.set('trust proxy', 1);

// The pages load scripts from CDNs and use inline handlers, so CSP is left to the proxy.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.server.allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
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

app.get('/', (_req, res) => res.redirect('/user-login'));
for (const page of PAGES) {
  app.get(`/${page}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, `${page}.html`)));
}

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    }
  });
});

app.use(errorHandler);

webSocketService.initialize(server);

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  // Give in-flight requests 10 s to finish before forcing the exit.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async (err) => {
    if (err) logger.error('Error closing HTTP server', err);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  try {
    assertProductionConfig();
    await initializeDatabase();
    server.listen(config.server.port, () => {
      logger.info(`Listening on port ${config.server.port} (${config.server.nodeEnv})`, {
        allowedOrigins: config.server.allowedOrigins,
        websocket: '/ws',
        health: '/health'
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start();
