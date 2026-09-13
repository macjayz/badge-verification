import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { adminAuthRoutes } from './admin-auth.routes';
import { jwtService } from '../services/jwt.service';
import { config } from '../config';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use('/api/admin/auth', adminAuthRoutes);

const login = (body: object) => request(app).post('/api/admin/auth/login').send(body);

describe('POST /api/admin/auth/login', () => {
  it('returns a token for the configured credentials', async () => {
    const res = await login({ username: config.admin.username, password: config.admin.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(jwtService.verifyToken(res.body.token)).toMatchObject({ role: 'admin' });
  });

  it('rejects a wrong password', async () => {
    const res = await login({ username: config.admin.username, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a wrong username', async () => {
    const res = await login({ username: 'root', password: config.admin.password });
    expect(res.status).toBe(401);
  });

  it('requires both fields', async () => {
    expect((await login({ username: 'admin' })).status).toBe(400);
    expect((await login({ password: 'x' })).status).toBe(400);
    expect((await login({})).status).toBe(400);
  });
});

describe('GET /api/admin/auth/verify', () => {
  const verify = (token?: string) => {
    const req = request(app).get('/api/admin/auth/verify');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('needs a token', async () => {
    expect((await verify()).status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const forged = jwt.sign({ userId: 'admin', wallet: 'x', role: 'admin' }, 'attacker-secret');
    expect((await verify(forged)).status).toBe(403);
  });

  it('rejects a valid token for a normal user', async () => {
    const userToken = jwtService.generateToken({ userId: 'u1', wallet: '0xabc' });
    const res = await verify(userToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin access required/);
  });

  it('accepts a real admin token', async () => {
    const adminToken = jwtService.generateToken({ userId: 'admin', wallet: 'x', role: 'admin' });
    expect((await verify(adminToken)).status).toBe(200);
  });
});

describe('POST /api/admin/auth/logout', () => {
  it('needs a token', async () => {
    expect((await request(app).post('/api/admin/auth/logout')).status).toBe(401);
  });
});
