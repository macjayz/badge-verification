import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Development-only fallbacks. These are deliberately weak and well-known, so
// production is required to override them (see assertProductionConfig below).
const DEV_JWT_SECRET = 'fallback-secret-change-me';
const DEV_ADMIN_USERNAME = 'admin';
const DEV_ADMIN_PASSWORD = 'admin123';

export const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv,
    isProduction,
    jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },
  admin: {
    username: process.env.ADMIN_USERNAME || DEV_ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD
  },
  database: {
    // Managed providers (Render, Railway, Heroku, Neon, Supabase) hand out a
    // single connection string. When DATABASE_URL is present it wins and the
    // discrete DB_* values below are ignored.
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'badgedb',
    // Most managed Postgres instances require TLS. Their certificates are often
    // signed by a private CA that isn't in the system trust store, which is why
    // rejectUnauthorized can be turned off separately.
    ssl: process.env.DB_SSL === 'true',
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  web3: {
    defaultChainId: parseInt(process.env.DEFAULT_CHAIN_ID || '1')
  }
};

/**
 * Refuse to boot in production with development credentials still in place.
 * Called from src/index.ts before the server starts listening.
 */
export function assertProductionConfig(): void {
  if (!isProduction) return;

  const problems: string[] = [];

  if (!process.env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set (tokens would be signed with a public default)');
  } else if (process.env.JWT_SECRET === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET is still the development default');
  } else if (process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET is shorter than 32 characters');
  }

  if (!process.env.ADMIN_PASSWORD) {
    problems.push('ADMIN_PASSWORD is not set (admin panel would accept the public default)');
  } else if (process.env.ADMIN_PASSWORD === DEV_ADMIN_PASSWORD) {
    problems.push('ADMIN_PASSWORD is still the development default');
  }

  // Stub adapters fake DID checks and mints; they exist for local development only.
  if (process.env.USE_REAL_ADAPTERS !== 'true') {
    problems.push('USE_REAL_ADAPTERS is not "true" (identity checks and mints would be simulated)');
  } else {
    for (const name of ['DEPLOYER_PRIVATE_KEY', 'CONTRACT_ADDRESS']) {
      if (!process.env[name]) problems.push(`${name} is not set (badges cannot be minted on-chain)`);
    }
  }

  // With "*", anyone can issue themselves a credential and pass the identity check.
  const issuers = (process.env.PRIVADO_ALLOWED_ISSUERS || '').split(',').map(i => i.trim()).filter(Boolean);
  if (issuers.length === 0 || issuers.includes('*')) {
    problems.push('PRIVADO_ALLOWED_ISSUERS must list the issuer DIDs you trust, not "*"');
  }

  if (problems.length > 0) {
    throw new Error(
      'Refusing to start in production with insecure configuration:\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nSet these in your environment and restart. See README, "Deploying".'
    );
  }
}
