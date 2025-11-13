export interface DIDVerificationRequest {
    wallet: string;
    callbackUrl: string;
    provider: string;
  }
  
  export interface DIDVerificationResponse {
    success: boolean;
    challengeUrl?: string;  // For redirect flows
    qrCode?: string;       // For QR code flows
    sessionId?: string;    // To track this verification session
    error?: string;
  }
  
  export interface DIDVerificationResult {
    success: boolean;
    did?: string;
    verificationId?: string;
    metadata?: any;
    error?: string;
  }
  
  export interface DIDAdapter {
    // Initialize verification process
    initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse>;
    
    // Handle callback from provider
    verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult>;
    
    // Get adapter name
    getName(): string;
    
    // Check if this adapter is configured/available
    isAvailable(): boolean;
  }