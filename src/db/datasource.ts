import path from 'path';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { User } from '../entities/User';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Achievement } from '../entities/Achievement';
import { UserSocialConnection } from '../entities/UserSocialConnection';
import { IssuerProfile } from '../entities/IssuerProfile';
import { ProjectSocialRules } from '../entities/ProjectSocialRules';
import { logger } from '../utils/logger';

// TLS settings shared by both connection styles. `false` (rather than
// undefined) keeps node-postgres from attempting TLS at all for local setups.
const ssl = config.database.ssl
  ? { rejectUnauthorized: config.database.sslRejectUnauthorized }
  : false;

// A DATABASE_URL from a managed provider replaces the discrete DB_* settings.
const connection = config.database.url
  ? { url: config.database.url }
  : {
      host: config.database.host,
      port: config.database.port,
      username: config.database.username,
      password: config.database.password,
      database: config.database.database
    };

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...connection,
  ssl,
  synchronize: config.server.nodeEnv === 'development',
  // Set DB_LOG=true to print every query while debugging.
  logging: process.env.DB_LOG === 'true' ? true : ['error', 'warn'],
  entities: [
    User,
    Verification,
    Issuer,
    BadgeType,
    BadgeMint,
    Achievement,
    UserSocialConnection,
    IssuerProfile,
    ProjectSocialRules
  ],
  // Resolved relative to this file so it works both under ts-node (src/) and
  // from the compiled build (dist/).
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  subscribers: [],
  extra: {
    max: 20,
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    logger.debug('Database connection established');
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};