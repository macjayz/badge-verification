/**
 * The production guard is what stops a deploy from going live with the
 * well-known development credentials. These tests pin that behaviour.
 *
 * config/index.ts reads NODE_ENV once at import time, so each case re-imports
 * the module with a fresh environment via jest.isolateModules.
 */

const DEV_JWT_SECRET = 'fallback-secret-change-me';
const STRONG_SECRET = 'x'.repeat(32);

function loadConfig(env: Record<string, string | undefined>) {
  let mod!: typeof import('./index');
  jest.isolateModules(() => {
    const original = process.env;
    process.env = { ...original, ...env } as NodeJS.ProcessEnv;
    try {
      mod = require('./index');
    } finally {
      process.env = original;
    }
  });
  return mod;
}

/** Load in production mode, then run the guard with these env values. */
function assertInProduction(env: Record<string, string | undefined>) {
  const mod = loadConfig({ NODE_ENV: 'production', ...env });
  const original = process.env;
  process.env = { ...original, NODE_ENV: 'production', ...env } as NodeJS.ProcessEnv;
  try {
    mod.assertProductionConfig();
  } finally {
    process.env = original;
  }
}

describe('assertProductionConfig', () => {
  it('does nothing outside production, so local dev keeps working', () => {
    const mod = loadConfig({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
      ADMIN_PASSWORD: undefined,
    });
    expect(() => mod.assertProductionConfig()).not.toThrow();
  });

  it('refuses to start when JWT_SECRET is missing', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: undefined, ADMIN_PASSWORD: 'a-real-password' }),
    ).toThrow(/JWT_SECRET is not set/);
  });

  it('refuses to start when JWT_SECRET is still the development default', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: DEV_JWT_SECRET, ADMIN_PASSWORD: 'a-real-password' }),
    ).toThrow(/JWT_SECRET is still the development default/);
  });

  it('refuses to start when JWT_SECRET is too short to be safe', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: 'short', ADMIN_PASSWORD: 'a-real-password' }),
    ).toThrow(/shorter than 32 characters/);
  });

  it('refuses to start when ADMIN_PASSWORD is missing', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: STRONG_SECRET, ADMIN_PASSWORD: undefined }),
    ).toThrow(/ADMIN_PASSWORD is not set/);
  });

  it('refuses to start when ADMIN_PASSWORD is still admin123', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: STRONG_SECRET, ADMIN_PASSWORD: 'admin123' }),
    ).toThrow(/ADMIN_PASSWORD is still the development default/);
  });

  it('reports every problem at once rather than one per restart', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: DEV_JWT_SECRET, ADMIN_PASSWORD: 'admin123' }),
    ).toThrow(/JWT_SECRET[\s\S]*ADMIN_PASSWORD/);
  });

  it('starts when both are set to real values', () => {
    expect(() =>
      assertInProduction({ JWT_SECRET: STRONG_SECRET, ADMIN_PASSWORD: 'a-real-password' }),
    ).not.toThrow();
  });
});

describe('database config', () => {
  it('prefers DATABASE_URL when a hosted provider supplies one', () => {
    const { config } = loadConfig({
      DATABASE_URL: 'postgres://u:p@db.example.com:5432/badges',
      DB_HOST: 'localhost',
    });
    expect(config.database.url).toBe('postgres://u:p@db.example.com:5432/badges');
  });

  it('leaves DATABASE_URL undefined for local setups', () => {
    const { config } = loadConfig({ DATABASE_URL: undefined });
    expect(config.database.url).toBeUndefined();
  });

  it('keeps SSL off unless DB_SSL is exactly "true"', () => {
    expect(loadConfig({ DB_SSL: undefined }).config.database.ssl).toBe(false);
    expect(loadConfig({ DB_SSL: 'false' }).config.database.ssl).toBe(false);
    expect(loadConfig({ DB_SSL: 'true' }).config.database.ssl).toBe(true);
  });

  it('validates certificates unless explicitly told not to', () => {
    expect(loadConfig({}).config.database.sslRejectUnauthorized).toBe(true);
    expect(
      loadConfig({ DB_SSL_REJECT_UNAUTHORIZED: 'false' }).config.database.sslRejectUnauthorized,
    ).toBe(false);
  });
});
