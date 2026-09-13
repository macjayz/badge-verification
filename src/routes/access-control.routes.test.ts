/**
 * Who may call what: admin-only pages, actions on your own wallet, and issuer
 * webhooks. Controllers and services are mocked; the routes and middleware
 * are real.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const ok = (name: string) => jest.fn((_req: any, res: any) => res.json({ handler: name }));

jest.mock('../controllers/user-management.controller', () => ({
  UserManagementController: {
    getUsers: ok('getUsers'), getUserStats: ok('getUserStats'),
    getUserDetails: ok('getUserDetails'), updateUserStatus: ok('updateUserStatus'),
  },
}));
jest.mock('../controllers/badge-management.controller', () => ({
  badgeManagementController: {
    getAllBadgeTypes: ok('getAllBadgeTypes'), createBadgeType: ok('createBadgeType'),
    getBadgeAnalytics: ok('getBadgeAnalytics'), updateBadgeType: ok('updateBadgeType'),
    updateEligibilityRules: ok('updateEligibilityRules'), toggleBadgeStatus: ok('toggleBadgeStatus'),
  },
}));
jest.mock('../controllers/dashboard.controller', () => ({
  dashboardController: new Proxy({}, { get: (_t, name: string) => ok(name) }),
}));
jest.mock('../services/twitter.service', () => ({
  twitterService: { disconnect: jest.fn(), verifyFollow: jest.fn(), initiateOAuth: jest.fn(), handleCallback: jest.fn() },
}));
jest.mock('../services/discord.service', () => ({
  discordService: { verifyServerMembership: jest.fn(), initiateOAuth: jest.fn(), handleCallback: jest.fn() },
}));
jest.mock('../services/verification.service', () => ({ verificationService: {} }));
jest.mock('../services/redis.service', () => ({ redisService: {} }));
jest.mock('../services/issuer.service', () => ({ issuerService: { getIssuerByApiKey: jest.fn() } }));
jest.mock('../services/webhook.service', () => ({
  webhookService: { registerWebhook: jest.fn(), getRegisteredIssuers: jest.fn(() => []) },
}));

import { userManagementRoutes } from './user-management.routes';
import { badgeManagementRoutes } from './badge-management.routes';
import { dashboardRoutes } from './dashboard.routes';
import { twitterVerificationRoutes } from './twitter-verification.routes';
import { discordVerificationRoutes } from './discord-verification.routes';
import { webhookRoutes } from './webhook.routes';
import { jwtService } from '../services/jwt.service';
import { twitterService } from '../services/twitter.service';
import { discordService } from '../services/discord.service';
import { issuerService } from '../services/issuer.service';
import { webhookService } from '../services/webhook.service';

const app = express();
app.use(express.json());
app.use('/api/admin/users', userManagementRoutes);
app.use('/api/admin/badges', badgeManagementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/verify/twitter', twitterVerificationRoutes);
app.use('/api/verify/discord', discordVerificationRoutes);
app.use('/api/webhooks', webhookRoutes);

const ALICE = '0x' + 'a'.repeat(40);
const BOB = '0x' + 'b'.repeat(40);
const userToken = (wallet = ALICE) => jwtService.generateToken({ userId: wallet, wallet });
const adminToken = () => jwtService.generateToken({ userId: 'admin', wallet: 'admin_dashboard', role: 'admin' });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('admin-only pages', () => {
  const adminRoutes: Array<[string, string]> = [
    ['get', '/api/admin/users'],
    ['patch', '/api/admin/users/u1/status'],
    ['get', '/api/admin/badges/types'],
    ['post', '/api/admin/badges/types'],
    ['patch', '/api/admin/badges/types/b1/eligibility'],
    ['get', '/api/dashboard/admin/stats'],
    ['get', '/api/dashboard/admin/debug-db'],
  ];

  it.each(adminRoutes)('%s %s needs a login', async (method, path) => {
    expect((await (request(app) as any)[method](path)).status).toBe(401);
  });

  it.each(adminRoutes)('%s %s refuses a normal wallet login', async (method, path) => {
    const res = await (request(app) as any)[method](path).set(bearer(userToken()));
    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it.each(adminRoutes)('%s %s allows an admin', async (method, path) => {
    const res = await (request(app) as any)[method](path).set(bearer(adminToken()));
    expect(res.status).toBe(200);
  });

  it('leaves the non-admin dashboard reachable for normal logins', async () => {
    const res = await request(app).get('/api/dashboard/stats').set(bearer(userToken()));
    expect(res.status).toBe(200);
  });
});

describe('actions on your own wallet', () => {
  const twitter = twitterService as jest.Mocked<typeof twitterService>;
  const discord = discordService as jest.Mocked<typeof discordService>;

  beforeEach(() => {
    twitter.disconnect.mockResolvedValue(undefined);
    twitter.verifyFollow.mockResolvedValue({ verified: true, details: {} });
    discord.verifyServerMembership.mockResolvedValue({ verified: true, details: {} });
  });

  it.each([
    '/api/verify/twitter/disconnect',
    '/api/verify/twitter/verify-follow',
    '/api/verify/discord/verify-membership',
  ])('%s needs a login', async (path) => {
    expect((await request(app).post(path).send({ wallet: ALICE })).status).toBe(401);
  });

  it('will not disconnect someone else’s Twitter', async () => {
    const res = await request(app)
      .post('/api/verify/twitter/disconnect')
      .set(bearer(userToken(BOB)))
      .send({ wallet: ALICE });
    expect(res.status).toBe(403);
    expect(twitter.disconnect).not.toHaveBeenCalled();
  });

  it('acts on the signed-in wallet when none is given', async () => {
    const res = await request(app).post('/api/verify/twitter/disconnect').set(bearer(userToken(ALICE))).send({});
    expect(res.status).toBe(200);
    expect(twitter.disconnect).toHaveBeenCalledWith(ALICE, undefined);
  });

  it('matches wallets regardless of letter case', async () => {
    const res = await request(app)
      .post('/api/verify/twitter/verify-follow')
      .set(bearer(userToken(ALICE)))
      .send({ wallet: ALICE.toUpperCase().replace('0X', '0x'), targetUsername: 'someone' });
    expect(res.status).toBe(200);
    expect(twitter.verifyFollow).toHaveBeenCalledWith(ALICE, 'someone', undefined);
  });

  it('can look up the issuer’s Discord server (handler keeps access to its helpers)', async () => {
    const res = await request(app)
      .post('/api/verify/discord/verify-membership')
      .set(bearer(userToken(ALICE)))
      .send({ issuerId: 'test-issuer-1' });
    expect(res.status).toBe(200);
    expect(discord.verifyServerMembership).toHaveBeenCalledWith(ALICE, '123456789012345678', 'test-issuer-1');
  });
});

describe('issuer webhooks', () => {
  const lookup = issuerService.getIssuerByApiKey as jest.Mock;
  const register = webhookService.registerWebhook as jest.Mock;

  beforeEach(() => {
    lookup.mockImplementation(async (key: string) =>
      key === 'acme-key' ? { id: 'acme', name: 'Acme', wallet: '0x1', isActive: true } : null,
    );
  });

  it('needs an issuer API key', async () => {
    const res = await request(app).post('/api/webhooks/register').send({ issuerId: 'acme', webhookUrl: 'https://x.example' });
    expect(res.status).toBe(401);
    expect(register).not.toHaveBeenCalled();
  });

  it('will not register a webhook for another issuer', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .set('x-api-key', 'acme-key')
      .send({ issuerId: 'rival', webhookUrl: 'https://attacker.example/steal' });
    expect(res.status).toBe(403);
    expect(register).not.toHaveBeenCalled();
  });

  it('registers for the calling issuer', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .set('x-api-key', 'acme-key')
      .send({ webhookUrl: 'https://acme.example/hook' });
    expect(res.status).toBe(200);
    expect(register).toHaveBeenCalledWith('acme', 'https://acme.example/hook');
  });

  it('rejects non-web URLs', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .set('x-api-key', 'acme-key')
      .send({ webhookUrl: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('only lists the caller’s own webhook', async () => {
    (webhookService.getRegisteredIssuers as jest.Mock).mockReturnValue(['acme', 'rival', 'other']);
    const res = await request(app).get('/api/webhooks/list').set('x-api-key', 'acme-key');
    expect(res.body.issuers).toEqual([{ issuerId: 'acme', registered: true }]);
  });
});
