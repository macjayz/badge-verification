/**
 * End-to-end checks of the Twitter/Discord login routes: a login is bound to
 * the wallet that started it, and the callback is only accepted once, from
 * that same wallet. External services are mocked; the state store is real
 * and backed by an in-memory Redis stand-in.
 */
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../services/redis.service', () => {
  const data = new Map<string, string>();
  return {
    redisService: {
      set: async (key: string, value: string) => void data.set(key, value),
      getDel: async (key: string) => {
        const value = data.get(key) ?? null;
        data.delete(key);
        return value;
      },
    },
  };
});
jest.mock('../services/twitter.service', () => ({
  twitterService: { initiateOAuth: jest.fn(), handleCallback: jest.fn() },
}));
jest.mock('../services/discord.service', () => ({
  discordService: { initiateOAuth: jest.fn(), handleCallback: jest.fn() },
}));
jest.mock('../services/verification.service', () => ({ verificationService: {} }));

import { twitterVerificationRoutes } from './twitter-verification.routes';
import { discordVerificationRoutes } from './discord-verification.routes';
import { twitterService } from '../services/twitter.service';
import { discordService } from '../services/discord.service';
import { jwtService } from '../services/jwt.service';

const app = express();
app.use(express.json());
app.use('/api/verify/twitter', twitterVerificationRoutes);
app.use('/api/verify/discord', discordVerificationRoutes);

const ALICE = '0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa';
const MALLORY = '0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb';
const tokenFor = (wallet: string) => jwtService.generateToken({ userId: wallet, wallet: wallet.toLowerCase() });

const twitter = twitterService as jest.Mocked<typeof twitterService>;
const discord = discordService as jest.Mocked<typeof discordService>;

beforeEach(() => {
  twitter.initiateOAuth.mockImplementation(async () => ({
    authUrl: 'https://twitter.com/i/oauth2/authorize?x',
    state: crypto.randomBytes(16).toString('hex'),
    codeVerifier: 'server-issued-verifier',
  }));
  twitter.handleCallback.mockResolvedValue({ id: '1', username: 'alice', name: 'Alice' });
  discord.initiateOAuth.mockImplementation(async () => ({
    authUrl: 'https://discord.com/api/oauth2/authorize?x',
    state: crypto.randomBytes(16).toString('hex'),
  }));
  discord.handleCallback.mockResolvedValue({ id: '1', username: 'alice', discriminator: '0' });
});

async function startLogin(provider: 'twitter' | 'discord', wallet: string, body: object = {}) {
  const res = await request(app)
    .post(`/api/verify/${provider}/oauth/initiate`)
    .set('Authorization', `Bearer ${tokenFor(wallet)}`)
    .send({ wallet, issuerId: 'issuer-1', ...body });
  expect(res.status).toBe(200);
  return res.body.data.state as string;
}

function finishLogin(provider: 'twitter' | 'discord', wallet: string | null, body: object) {
  const req = request(app).post(`/api/verify/${provider}/callback`);
  if (wallet) req.set('Authorization', `Bearer ${tokenFor(wallet)}`);
  return req.send({ code: 'provider-code', ...body });
}

describe('Twitter login', () => {
  it('cannot be started without signing in', async () => {
    const res = await request(app).post('/api/verify/twitter/oauth/initiate').send({ wallet: ALICE });
    expect(res.status).toBe(401);
    expect(twitter.initiateOAuth).not.toHaveBeenCalled();
  });

  it('cannot be started for someone else’s wallet', async () => {
    const res = await request(app)
      .post('/api/verify/twitter/oauth/initiate')
      .set('Authorization', `Bearer ${tokenFor(MALLORY)}`)
      .send({ wallet: ALICE });
    expect(res.status).toBe(403);
    expect(twitter.initiateOAuth).not.toHaveBeenCalled();
  });

  it('completes for the wallet that started it, using the server’s own record', async () => {
    const state = await startLogin('twitter', ALICE);

    // The body tries to swap in a different wallet, issuer and verifier.
    const res = await finishLogin('twitter', ALICE, {
      state,
      wallet: MALLORY,
      issuerId: 'evil-issuer',
      code_verifier: 'attacker-verifier',
    });

    expect(res.status).toBe(200);
    expect(twitter.handleCallback).toHaveBeenCalledWith(
      ALICE.toLowerCase(),
      'provider-code',
      state,
      'server-issued-verifier',
      'issuer-1',
    );
  });

  it('rejects a callback without signing in', async () => {
    const state = await startLogin('twitter', ALICE);
    expect((await finishLogin('twitter', null, { state })).status).toBe(401);
  });

  it('rejects a state that was never issued', async () => {
    const res = await finishLogin('twitter', ALICE, { state: crypto.randomBytes(16).toString('hex') });
    expect(res.status).toBe(400);
    expect(twitter.handleCallback).not.toHaveBeenCalled();
  });

  it('rejects a callback from a different wallet than the one that started it', async () => {
    const state = await startLogin('twitter', ALICE);
    const res = await finishLogin('twitter', MALLORY, { state });
    expect(res.status).toBe(403);
    expect(twitter.handleCallback).not.toHaveBeenCalled();
  });

  it('cannot be replayed', async () => {
    const state = await startLogin('twitter', ALICE);
    expect((await finishLogin('twitter', ALICE, { state })).status).toBe(200);
    expect((await finishLogin('twitter', ALICE, { state })).status).toBe(400);
    expect(twitter.handleCallback).toHaveBeenCalledTimes(1);
  });

  it('serves the redirect page with the query values as data, not code', async () => {
    const attack = "x';alert('HACKED');//";
    const res = await request(app)
      .get('/api/verify/twitter/callback')
      .query({ code: 'abc', state: attack });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).not.toContain(`state: '${attack}'`);
    expect(res.text).toContain(JSON.stringify(attack));
  });
});

describe('Discord login', () => {
  it('completes for the wallet that started it', async () => {
    const state = await startLogin('discord', ALICE);
    const res = await finishLogin('discord', ALICE, { state, wallet: MALLORY, issuerId: 'evil-issuer' });

    expect(res.status).toBe(200);
    expect(discord.handleCallback).toHaveBeenCalledWith(ALICE.toLowerCase(), 'provider-code', state, 'issuer-1');
  });

  it('rejects a callback from a different wallet', async () => {
    const state = await startLogin('discord', ALICE);
    expect((await finishLogin('discord', MALLORY, { state })).status).toBe(403);
    expect(discord.handleCallback).not.toHaveBeenCalled();
  });

  it('does not accept a Twitter state', async () => {
    const state = await startLogin('twitter', ALICE);
    expect((await finishLogin('discord', ALICE, { state })).status).toBe(400);
  });

  it('cannot be started without signing in', async () => {
    const res = await request(app).post('/api/verify/discord/oauth/initiate').send({ wallet: ALICE });
    expect(res.status).toBe(401);
  });

  it('escapes the redirect page', async () => {
    const attack = '</script><script>alert(1)</script>';
    const res = await request(app).get('/api/verify/discord/callback').query({ code: 'abc', state: attack });
    expect(res.text.match(/<\/script>/g)).toHaveLength(1);
  });
});
