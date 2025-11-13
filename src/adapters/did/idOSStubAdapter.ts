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
  
    async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
      console.log(`[IdOS Stub] Starting verification for wallet: ${request.wallet}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const sessionId = this.generateSessionId();
      
      return {
        success: true,
        challengeUrl: `http://localhost:3000/api/did/idos/callback?session=${sessionId}`,
        sessionId,
      };
    }
  
    async verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult> {
      console.log(`[IdOS Stub] Verifying callback for session: ${sessionId}`, payload);
      
      // Simulate verification processing
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Mock successful verification 90% of the time for IdOS
      const success = Math.random() > 0.1;
      
      if (success) {
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
      } else {
        return {
          success: false,
          error: 'Mock IdOS verification failed - data sharing not authorized'
        };
      }
    }
  }