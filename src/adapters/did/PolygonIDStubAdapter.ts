import {
    DIDVerificationRequest,
    DIDVerificationResponse,
    DIDVerificationResult
  } from './DIDAdapter.interface';
  import { BaseStubAdapter } from './BaseStubAdapter';

  export class PolygonIDStubAdapter extends BaseStubAdapter {
    constructor() {
      super('polygonid');
    }

    async initVerification(_request: DIDVerificationRequest): Promise<DIDVerificationResponse> {

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const sessionId = this.generateSessionId();

      return {
        success: true,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=polygonid-stub-${sessionId}`,
        sessionId,
      };
    }

    async verifyCallback(payload: any, _sessionId?: string): Promise<DIDVerificationResult> {
      // Stand-in latency so the UI's pending state is visible during local development.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockDID = this.generateMockDID(payload.wallet || 'unknown');
      return {
        success: true,
        did: mockDID,
        verificationId: `polygonid_verification_${Date.now()}`,
        metadata: {
          provider: 'polygonid',
          timestamp: new Date().toISOString(),
          credentialType: 'KYCAgeCredential', // Example credential
          level: 'basic'
        }
      };
    }
  }