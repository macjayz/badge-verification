import {
    DIDVerificationRequest,
    DIDVerificationResponse,
    DIDVerificationResult
  } from './DIDAdapter.interface';
  import { BaseStubAdapter } from './BaseStubAdapter';

  export class IdOSStubAdapter extends BaseStubAdapter {
    constructor() {
      super('idos');
    }

    async initVerification(_request: DIDVerificationRequest): Promise<DIDVerificationResponse> {

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));

      const sessionId = this.generateSessionId();

      return {
        success: true,
        challengeUrl: `http://localhost:3000/api/did/idos/callback?session=${sessionId}`,
        sessionId,
      };
    }

    async verifyCallback(payload: any, _sessionId?: string): Promise<DIDVerificationResult> {
      // Stand-in latency so the UI's pending state is visible during local development.
      await new Promise(resolve => setTimeout(resolve, 1200));
      const mockDID = this.generateMockDID(payload.wallet || 'unknown');
      return {
        success: true,
        did: mockDID,
        verificationId: `idos_verification_${Date.now()}`,
        metadata: {
          provider: 'idos',
          timestamp: new Date().toISOString(),
          dataSharing: true,
          grants: ['profile', 'credentials']
        }
      };
    }
  }