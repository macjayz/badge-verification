/**
 * Finishing a DID verification: pending sessions stay open, and one identity can verify only one
 * wallet (otherwise a single credential could farm badges across many wallets).
 */
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';

const rows: Verification[] = [];
let completedElsewhere = 0;

jest.mock('../db/datasource', () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async ({ where }: any) => rows.find(r => (where.sessionId && r.sessionId === where.sessionId) || r.id === where.id) ?? null,
      save: async (row: any) => row,
      update: async () => ({ affected: 1 }),
      create: (data: any) => data,
      createQueryBuilder: () => {
        const builder: any = { where: () => builder, andWhere: () => builder, getCount: async () => completedElsewhere };
        return builder;
      },
    }),
  },
}));
jest.mock('./did.service', () => ({
  didService: { handleCallback: jest.fn() },
  canonicalProvider: (p: string) => (p === 'polygonid' ? 'privadoid' : p),
}));
jest.mock('./webhook.service', () => ({ webhookService: { getRegisteredIssuers: () => [], sendWebhook: jest.fn() } }));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { verificationService } from './verification.service';
import { didService } from './did.service';

function session(sessionId: string): Verification {
  const v = Object.assign(new Verification(), {
    id: `v-${sessionId}`,
    wallet: '0xalice',
    provider: 'privadoid',
    type: VerificationType.PRIMARY_DID,
    status: VerificationStatus.PENDING,
    sessionId,
    expiresAt: new Date(Date.now() + 60_000),
    metadata: {},
  });
  rows.push(v);
  return v;
}

beforeEach(() => {
  rows.length = 0;
  completedElsewhere = 0;
});

it('leaves the session pending while the wallet has not answered', async () => {
  session('s1');
  (didService.handleCallback as jest.Mock).mockResolvedValue({ success: false, pending: true });
  const result = await verificationService.handleDIDVerificationCallback('privadoid', {}, 's1');
  expect(result.status).toBe(VerificationStatus.PENDING);
});

it('completes with the DID the provider confirmed', async () => {
  session('s2');
  (didService.handleCallback as jest.Mock).mockResolvedValue({ success: true, did: 'did:iden3:alice' });
  const result = await verificationService.handleDIDVerificationCallback('privadoid', {}, 's2');
  expect(result.status).toBe(VerificationStatus.COMPLETED);
  expect(result.did).toBe('did:iden3:alice');
});

it('refuses an identity that already verified a different wallet', async () => {
  session('s3');
  completedElsewhere = 1;
  (didService.handleCallback as jest.Mock).mockResolvedValue({ success: true, did: 'did:iden3:shared' });
  const result = await verificationService.handleDIDVerificationCallback('privadoid', {}, 's3');
  expect(result.status).toBe(VerificationStatus.FAILED);
  expect(result.errorMessage).toMatch(/already linked to another wallet/);
});
