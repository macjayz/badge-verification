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
  
    async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
      console.log(`[PolygonID Stub] Starting verification for wallet: ${request.wallet}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sessionId = this.generateSessionId();
      
      return {
        success: true,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=polygonid-stub-${sessionId}`,
        sessionId,
      };
    }
  
    async verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult> {
      console.log(`[PolygonID Stub] Verifying callback for session: ${sessionId}`, payload);
      
      // Simulate verification processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock successful verification 80% of the time
      const success = Math.random() > 0.2;
      
      if (success) {
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
      } else {
        return {
          success: false,
          error: 'Mock verification failed - credential requirements not met'
        };
      }
    }
  }