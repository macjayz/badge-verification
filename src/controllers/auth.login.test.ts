/**
 * Wallet login (Sign-In with Ethereum). Real wallets sign real messages here;
 * only the database and Redis are replaced with in-memory stand-ins.
 */
import express from 'express';
import request from 'supertest';
import { ethers } from 'ethers';

let mockProduction = false;

jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  return {
    ...actual,
    config: {
      ...actual.config,
      server: {
        ...actual.config.server,
        get isProduction() {
          return mockProduction;
        },
      },
    },
  };
});
jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../services/redis.service', () => {
  const data = new Map<string, string>();
  return {
    redisService: {
      set: async (key: string, value: string) => void data.set(key, value),
      get: async (key: string) => data.get(key) ?? null,
      del: async (key: string) => void data.delete(key),
      getDel: async (key: string) => {
        const value = data.get(key) ?? null;
        data.delete(key);
        return value;
      },
    },
  };
});
jest.mock('../db/datasource', () => {
  const users: any[] = [];
  const repo = {
    findOne: async ({ where }: any) => users.find((u) => u.wallet === where.wallet || u.id === where.id) ?? null,
    findOneOrFail: async ({ where }: any) => users.find((u) => u.wallet === where.wallet),
    create: (data: any) => ({ ...data }),
    save: async (user: any) => {
      user.id ??= `user-${users.length + 1}`;
      users.push(user);
      return user;
    },
  };
  return { AppDataSource: { getRepository: () => repo } };
});

import authRoutes from '../routes/auth.routes';
import { jwtService } from '../services/jwt.service';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const HOST = 'badges.example';

async function begin(wallet: { address: string } | string, host = HOST) {
  const address = typeof wallet === 'string' ? wallet : wallet.address;
  return request(app).post('/api/auth/init').set('Host', host).send({ address });
}

function finish(message: string, signature: string, host = HOST) {
  return request(app).post('/api/auth/verify').set('Host', host).send({ message, signature });
}

beforeEach(() => {
  mockProduction = false;
});

describe('POST /api/auth/init', () => {
  it('rejects a bad address', async () => {
    expect((await begin('not-an-address')).status).toBe(400);
  });

  it('issues a message for this site, with the checksummed address, that expires', async () => {
    const wallet = ethers.Wallet.createRandom();
    const res = await begin(wallet.address.toLowerCase()); // wallets often report lowercase

    expect(res.status).toBe(200);
    expect(res.body.address).toBe(wallet.address);
    expect(res.body.message).toMatch(new RegExp(`^${HOST} wants you to sign in`));
    expect(res.body.message).toContain(wallet.address);
    expect(res.body.message).toContain(`Nonce: ${res.body.nonce}`);
    expect(res.body.message).toMatch(/Expiration Time: /);
  });
});

describe('POST /api/auth/verify', () => {
  it('logs in the wallet that signed the issued message', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = (await begin(wallet)).body;

    const res = await finish(message, await wallet.signMessage(message));

    expect(res.status).toBe(200);
    expect(res.body.user.wallet).toBe(wallet.address.toLowerCase());
    expect(jwtService.verifyToken(res.body.token)).toMatchObject({ wallet: wallet.address.toLowerCase() });
  });

  it('rejects a signature from a different wallet', async () => {
    const victim = ethers.Wallet.createRandom();
    const attacker = ethers.Wallet.createRandom();
    const { message } = (await begin(victim)).body;

    const res = await finish(message, await attacker.signMessage(message));
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a message the server never issued, even if properly signed', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = (await begin(wallet)).body;
    const forged = message.replace(/Expiration Time: .*/, 'Expiration Time: 2099-01-01T00:00:00.000Z');

    expect((await finish(forged, await wallet.signMessage(forged))).status).toBe(401);
  });

  it('rejects a login that was never started', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = (await begin(wallet)).body;
    const signature = await wallet.signMessage(message);
    await finish(message, signature); // uses up the pending login

    const other = ethers.Wallet.createRandom();
    const unstarted = message.replace(wallet.address, other.address);
    expect((await finish(unstarted, await other.signMessage(unstarted))).status).toBe(401);
  });

  it('cannot be replayed', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = (await begin(wallet)).body;
    const signature = await wallet.signMessage(message);

    expect((await finish(message, signature)).status).toBe(200);
    expect((await finish(message, signature)).status).toBe(401);
  });

  it('rejects a message issued for a different site', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = (await begin(wallet, 'evil.example')).body;

    expect((await finish(message, await wallet.signMessage(message), HOST)).status).toBe(401);
  });

  it('rejects junk without crashing', async () => {
    expect((await finish('hello', '0x1234')).status).toBe(401);
    expect((await request(app).post('/api/auth/verify').set('Host', HOST).send({})).status).toBe(400);
  });
});

describe('POST /api/auth/dev-verify (demo login)', () => {
  const wallet = '0x' + '3'.repeat(40);

  it('works locally', async () => {
    const res = await request(app).post('/api/auth/dev-verify').send({ wallet });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('is switched off in production', async () => {
    mockProduction = true;
    const res = await request(app).post('/api/auth/dev-verify').send({ wallet });
    expect(res.status).toBe(404);
    expect(res.body.token).toBeUndefined();
  });
  it('refuses a suspended account', async () => {
    const suspended = '0x' + '4'.repeat(40);
    await request(app).post('/api/auth/dev-verify').send({ wallet: suspended });
    const { AppDataSource } = jest.requireMock('../db/datasource');
    const user = await AppDataSource.getRepository().findOne({ where: { wallet: suspended } });
    user.isActive = false;

    const res = await request(app).post('/api/auth/dev-verify').send({ wallet: suspended });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });
});

describe('GET /api/auth/options', () => {
  it('offers the demo login only outside production', async () => {
    expect((await request(app).get('/api/auth/options')).body).toEqual({ demoLogin: true });
    mockProduction = true;
    expect((await request(app).get('/api/auth/options')).body).toEqual({ demoLogin: false });
  });
});
