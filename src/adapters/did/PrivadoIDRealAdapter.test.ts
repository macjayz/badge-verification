/**
 * The Privado ID adapter against the verifier backend's current API (checked live on 1 Nov 2026):
 * POST /sign-in takes a `scope` array and returns { qrCode, sessionID }, and GET /status returns
 * { status: pending | success | error, jwz, message }.
 */
import { PrivadoIDRealAdapter, didFromJwz } from './PrivadoIDRealAdapter';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const USER_DID = 'did:iden3:privado:main:2ScrbEuw9jLXMapW3DELXBbDco5EURzJZRN1tYj7L7';
const jwzFrom = (from: string) =>
  ['header', Buffer.from(JSON.stringify({ from, typ: 'application/iden3comm-plain-json' })).toString('base64url'), 'proof'].join('.');

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  delete process.env.PRIVADO_ALLOWED_ISSUERS;
  delete process.env.PRIVADO_CHAIN_ID;
});

describe('initVerification', () => {
  it('sends the scope-based proof request the backend expects', async () => {
    fetchMock.mockResolvedValue(respond(200, { qrCode: 'iden3comm://?request_uri=https://x/qr-store?id=1', sessionID: 'abc-123' }));
    process.env.PRIVADO_ALLOWED_ISSUERS = 'did:iden3:issuer:a, did:iden3:issuer:b';

    const result = await new PrivadoIDRealAdapter().initVerification({ wallet: '0x1', callbackUrl: '', provider: 'privadoid' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://verifier-backend.privado.id/sign-in');
    const body = JSON.parse(init.body);
    expect(body.chainID).toBe('80002');
    expect(body.scope).toHaveLength(1);
    expect(body.scope[0].circuitId).toBe('credentialAtomicQuerySigV2');
    expect(body.scope[0].query.type).toBe('KYCAgeCredential');
    expect(body.scope[0].query.allowedIssuers).toEqual(['did:iden3:issuer:a', 'did:iden3:issuer:b']);
    expect(result).toMatchObject({ success: true, sessionId: 'abc-123', qrCode: 'iden3comm://?request_uri=https://x/qr-store?id=1' });
  });

  it('reports a rejected request instead of throwing', async () => {
    fetchMock.mockResolvedValue(respond(400, { message: 'field scope is empty' }));
    const result = await new PrivadoIDRealAdapter().initVerification({ wallet: '0x1', callbackUrl: '', provider: 'privadoid' });
    expect(result).toEqual({ success: false, error: 'Privado ID rejected the request (400)' });
  });
});

describe('verifyCallback', () => {
  const adapter = () => new PrivadoIDRealAdapter();

  it('keeps waiting while the wallet has not answered', async () => {
    fetchMock.mockResolvedValue(respond(200, { status: 'pending', jwz: null, message: null }));
    expect(await adapter().verifyCallback({}, 'abc-123')).toMatchObject({ success: false, pending: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://verifier-backend.privado.id/status?sessionID=abc-123');
  });

  it('takes the DID from the signed response once the proof is verified', async () => {
    fetchMock.mockResolvedValue(respond(200, { status: 'success', jwz: jwzFrom(USER_DID), message: null }));
    expect(await adapter().verifyCallback({}, 'abc-123')).toMatchObject({ success: true, did: USER_DID });
  });

  it('never invents a DID when the backend does not provide one', async () => {
    fetchMock.mockResolvedValue(respond(200, { status: 'success', jwz: null, message: null }));
    const result = await adapter().verifyCallback({}, 'abc-123');
    expect(result.success).toBe(false);
    expect(result.did).toBeUndefined();
  });

  it('ignores a DID the caller posts itself', async () => {
    fetchMock.mockResolvedValue(respond(200, { status: 'pending', jwz: null, message: null }));
    const result = await adapter().verifyCallback({ from: 'did:attacker', did: 'did:attacker' }, 'abc-123');
    expect(result.success).toBe(false);
    expect(result.did).toBeUndefined();
  });

  it('fails when the backend rejects the proof', async () => {
    fetchMock.mockResolvedValue(respond(200, { status: 'error', jwz: null, message: 'proof is invalid' }));
    expect(await adapter().verifyCallback({}, 'abc-123')).toEqual({ success: false, error: 'proof is invalid' });
  });

  it('fails cleanly when Privado ID is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await adapter().verifyCallback({}, 'abc-123')).toEqual({ success: false, error: 'Privado ID is unreachable' });
  });
});

describe('didFromJwz', () => {
  it('reads the sender DID', () => {
    expect(didFromJwz(jwzFrom(USER_DID))).toBe(USER_DID);
  });

  it('rejects anything that is not a DID', () => {
    expect(didFromJwz(jwzFrom('not-a-did'))).toBeUndefined();
    expect(didFromJwz('garbage')).toBeUndefined();
  });
});
