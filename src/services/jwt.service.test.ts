import jwt from 'jsonwebtoken';
import { JWTService } from './jwt.service';
import { config } from '../config';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('JWTService', () => {
  const service = new JWTService();
  const payload = { userId: 'user-1', wallet: '0xabc', role: 'admin' };

  it('round-trips a payload through sign and verify', () => {
    const decoded = service.verifyToken(service.generateToken(payload));
    expect(decoded).toMatchObject(payload);
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign(payload, 'some-other-secret');
    expect(service.verifyToken(foreign)).toBeNull();
  });

  it('rejects a tampered token instead of throwing', () => {
    const token = service.generateToken(payload);
    const tampered = token.slice(0, -3) + 'aaa';
    expect(service.verifyToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(payload, config.server.jwtSecret, { expiresIn: '-1s' });
    expect(service.verifyToken(expired)).toBeNull();
  });

  it('rejects garbage without throwing', () => {
    expect(service.verifyToken('not-a-token')).toBeNull();
    expect(service.verifyToken('')).toBeNull();
  });

  it('refuses to mint a token without userId or wallet', () => {
    expect(() => service.generateToken({ userId: '', wallet: '0xabc' })).toThrow(/required/);
    expect(() => service.generateToken({ userId: 'u', wallet: '' })).toThrow(/required/);
  });

  it('sets an expiry so tokens do not live forever', () => {
    const decoded = jwt.decode(service.generateToken(payload)) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });
});
