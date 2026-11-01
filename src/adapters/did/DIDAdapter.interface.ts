export interface DIDVerificationRequest {
  wallet: string;
  callbackUrl: string;
  provider: string;
}

export interface DIDVerificationResponse {
  success: boolean;
  challengeUrl?: string; // Link a wallet app can open
  qrCode?: string; // Payload to render as a QR code
  sessionId?: string; // The provider's session, used to poll for the result
  error?: string;
}

export interface DIDVerificationResult {
  success: boolean;
  // The user has not finished in their wallet yet; ask again later.
  pending?: boolean;
  did?: string;
  verificationId?: string;
  metadata?: any;
  error?: string;
}

export interface DIDAdapter {
  initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse>;
  // Checks the session with the provider. `payload` is whatever the caller posted, if anything.
  verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult>;
  getName(): string;
  isAvailable(): boolean;
}
