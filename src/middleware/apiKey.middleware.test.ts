import { authenticateApiKey, AuthenticatedIssuerRequest } from './apiKey.middleware';
import { issuerService } from '../services/issuer.service';

jest.mock('../services/issuer.service', () => ({
  issuerService: { getIssuerByApiKey: jest.fn() },
}));
jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const lookup = issuerService.getIssuerByApiKey as jest.Mock;

function run(apiKey?: string) {
  const req = { headers: apiKey ? { 'x-api-key': apiKey } : {} } as AuthenticatedIssuerRequest;
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return authenticateApiKey(req, res, next).then(() => ({ req, res, next }));
}

describe('authenticateApiKey', () => {
  it('blocks requests with no API key', async () => {
    const { res, next } = await run();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('blocks an unknown API key', async () => {
    lookup.mockResolvedValue(null);
    const { res, next } = await run('bogus');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks a deactivated issuer', async () => {
    lookup.mockResolvedValue({ id: 'i1', name: 'Acme', wallet: '0x1', isActive: false });
    const { res, next } = await run('key');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets an active issuer through and attaches only safe fields', async () => {
    lookup.mockResolvedValue({
      id: 'i1', name: 'Acme', wallet: '0x1', isActive: true, apiKey: 'secret-key',
    });
    const { req, next } = await run('secret-key');
    expect(next).toHaveBeenCalled();
    expect(req.issuer).toEqual({ id: 'i1', name: 'Acme', wallet: '0x1' });
  });

  it('fails closed with a 500 if the lookup throws', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    const { res, next } = await run('key');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
