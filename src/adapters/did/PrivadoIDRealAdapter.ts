import {
    DIDAdapter,
    DIDVerificationRequest,
    DIDVerificationResponse,
    DIDVerificationResult
  } from './DIDAdapter.interface';
  import { logger } from '../../utils/logger';

  // Interfaces based on EXACT API documentation
  interface PrivadoIDVerificationCreateRequest {
    chainID: string;  // "80002" for Polygon Amoy, "137" for Mainnet
    circuitID: string; // "credentialAtomicQuerySigV2" or "credentialAtomicQueryMTPV2"
    skipClaimRevocationCheck: boolean;
    query: {
      context: string;
      allowedIssuers: string[];  // ["*"] for any, or specific issuer DIDs
      type: string;  // Credential type like "KYCAgeCredential"
      credentialSubject: Record<string, any>;
    };
  }

  interface PrivadoIDVerificationCreateResponse {
    qrCode: {
      body: {
        callbackUrl: string;
        reason: string;
        scope: Array<{
          circuitId: string;
          id: number;
          query: {
            allowedIssuers: string[];
            context: string;
            credentialSubject: Record<string, any>;
            skipClaimRevocationCheck?: boolean;
            type: string;
          };
        }>;
      };
      from: string;  // Verifier DID
      id: string;
      thid: string;
      typ: string;
      type: string;
    };
    sessionID: number;
  }

  interface PrivadoIDVerificationStatusResponse {
    sessionID: number;
    status: 'pending' | 'verified' | 'failed' | 'expired';
    did?: string;
    verifiedAt?: string;
    error?: string;
  }

  export class PrivadoIDRealAdapter implements DIDAdapter {
    readonly name = 'privadoid';
    private readonly apiBaseUrl: string;
    private readonly apiKey?: string;

    constructor() {
      // Using their hosted verifier backend API
      this.apiBaseUrl = process.env.PRIVADO_VERIFIER_API_URL || 'https://verifier-backend.privado.id';
      this.apiKey = process.env.PRIVADO_API_KEY;

      if (!this.apiKey) {
        logger.warn('Privado ID API key not configured - using public verifier backend (may have rate limits)');
      }
    }

    getName(): string {
      return this.name;
    }

    isAvailable(): boolean {
      // Can work without API key (public), but with limits
      return true;
    }

    async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
      try {
        logger.info(`Initiating Privado ID verification for wallet: ${request.wallet}`);

        // Calculate birth year for "over 18" check
        const currentYear = new Date().getFullYear();
        const birthYearThreshold = currentYear - 18;

        // Prepare the verification request based on EXACT API documentation
        const verificationRequest: PrivadoIDVerificationCreateRequest = {
          chainID: process.env.PRIVADO_CHAIN_ID || '80002', // Polygon Amoy testnet
          circuitID: 'credentialAtomicQuerySigV2', // Signature-based proof
          skipClaimRevocationCheck: false,
          query: {
            context: 'https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld',
            allowedIssuers: ['*'], // Accept any issuer for testing
            type: 'KYCAgeCredential',
            credentialSubject: {
              birthday: {
                $lt: parseInt(`${birthYearThreshold}0101`) // Born before Jan 1 of (current year - 18)
              }
            }
          }
        };

        // Add API key header if available
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
          headers['X-API-Key'] = this.apiKey;
        }

        logger.debug('Sending Privado ID verification request:', verificationRequest);

        // Make EXACT API call as per documentation
        const response = await fetch(`${this.apiBaseUrl}/sign-in`, {
          method: 'POST',
          headers,
          body: JSON.stringify(verificationRequest)
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Privado ID API error (${response.status}): ${errorText}`);

          if (response.status === 401) {
            throw new Error('Invalid API key. Please check your PRIVADO_API_KEY.');
          }

          if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later or use an API key.');
          }

          throw new Error(`Failed to create verification: ${response.statusText}`);
        }

        const data = await response.json() as PrivadoIDVerificationCreateResponse;

        logger.info(`Privado ID verification created. Session ID: ${data.sessionID}`);

        // Create QR code data - frontend can render this
        const qrCodeData = JSON.stringify(data.qrCode);
        const universalLink = `iden3comm://?i_m=${Buffer.from(qrCodeData).toString('base64')}`;

        return {
          success: true,
          qrCode: qrCodeData, // Frontend will render this as QR
          sessionId: data.sessionID.toString(),
          challengeUrl: universalLink
        };

      } catch (error: any) {
        logger.error('Privado ID initiation failed:', error);
        return {
          success: false,
          error: error.message || 'Failed to initiate Privado ID verification'
        };
      }
    }

    async verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult> {
      try {
        if (!sessionId) {
          return {
            success: false,
            error: 'Session ID is required for verification'
          };
        }

        logger.info(`Checking Privado ID verification status for session: ${sessionId}`);

        // Prepare headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
          headers['X-API-Key'] = this.apiKey;
        }

        // Check verification status as per documentation
        const response = await fetch(`${this.apiBaseUrl}/status?sessionID=${sessionId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Privado ID status check failed (${response.status}): ${errorText}`);

          // If 404, session might not exist yet
          if (response.status === 404) {
            return {
              success: false,
              error: 'Verification session not found. It may have expired.'
            };
          }

          throw new Error(`Failed to check verification status: ${response.statusText}`);
        }

        const data = await response.json() as PrivadoIDVerificationStatusResponse;

        logger.info(`Privado ID verification status for session ${sessionId}: ${data.status}`);

        switch (data.status) {
          case 'verified':
            return {
              success: true,
              did: data.did || this.extractDIDFromPayload(payload),
              verificationId: sessionId,
              metadata: {
                verifiedAt: data.verifiedAt,
                provider: 'privadoid',
                credentialType: 'KYCAgeCredential',
                status: 'verified'
              }
            };

          case 'failed':
            return {
              success: false,
              error: data.error || 'Verification failed'
            };

          case 'expired':
            return {
              success: false,
              error: 'Verification session expired'
            };

          case 'pending':
          default:
            return {
              success: false,
              error: 'Verification still pending. Please complete the verification in your wallet.'
            };
        }

      } catch (error: any) {
        logger.error('Privado ID callback verification failed:', error);
        return {
          success: false,
          error: error.message || 'Verification service unavailable'
        };
      }
    }

    // Helper method to extract DID from callback payload
    private extractDIDFromPayload(payload: any): string | undefined {
      // The actual proof payload from wallet will contain the DID
      if (payload?.from) {
        return payload.from;
      }

      if (payload?.did) {
        return payload.did;
      }

      if (payload?.sender) {
        return payload.sender;
      }

      // Try to extract from iden3comm message
      if (payload?.body?.from) {
        return payload.body.from;
      }

      // Return a fallback DID (for testing only)
      return `did:polygonid:polygon:amoy:unknown-${Date.now()}`;
    }
  }