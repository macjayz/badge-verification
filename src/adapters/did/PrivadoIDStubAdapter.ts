import { randomUUID } from 'crypto';
import { DIDAdapter, DIDVerificationRequest, DIDVerificationResponse, DIDVerificationResult } from './DIDAdapter.interface';

/**
 * Local-development stand-in for Privado ID: every session verifies with a mock DID unique to
 * that session. Registered only when USE_REAL_ADAPTERS is not "true", which production forbids.
 */
export class PrivadoIDStubAdapter implements DIDAdapter {
  readonly name = 'privadoid';

  getName(): string {
    return this.name;
  }

  isAvailable(): boolean {
    return true;
  }

  async initVerification(_request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
    const sessionId = randomUUID();
    return {
      success: true,
      sessionId,
      qrCode: `iden3comm://?request_uri=stub-session-${sessionId}`
    };
  }

  async verifyCallback(_payload: any, sessionId?: string): Promise<DIDVerificationResult> {
    return {
      success: true,
      did: `did:mock:privadoid:${sessionId}`,
      verificationId: sessionId,
      metadata: { provider: 'privadoid', stub: true, verifiedAt: new Date().toISOString() }
    };
  }
}
