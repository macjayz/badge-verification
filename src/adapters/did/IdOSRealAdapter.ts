import { DIDAdapter, DIDVerificationRequest, DIDVerificationResponse, DIDVerificationResult } from './DIDAdapter.interface';
import { logger } from '../../utils/logger';

interface IdOSVerificationAPIResponse {
  session_id: string;
  verification_url: string;
  expires_at: string;
}

interface IdOSVerificationStatus {
  status: 'completed' | 'failed' | 'pending';
  verified: boolean;
  did?: string;
  credentials?: any[];
  credential_types?: string[];
  social_accounts?: any[];
  verified_at?: string;
  error_message?: string;
}

export class IdOSRealAdapter implements DIDAdapter {
  readonly name = 'idos';
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiBaseUrl = process.env.IDOS_API_URL || 'https://api.idos.network';
    this.apiKey = process.env.IDOS_API_KEY!;
    
    if (!this.apiKey) {
      logger.warn('IdOS API key not configured - using fallback mode');
    }
  }

  getName(): string {
    return this.name;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'IdOS adapter not configured'
        };
      }

      // Create verification session with IdOS
      const response = await fetch(`${this.apiBaseUrl}/v1/verification-sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_address: request.wallet,
          redirect_uri: request.callbackUrl,
          scope: ['identity', 'social'],
          required_credentials: ['proof_of_humanity']
        })
      });

      if (!response.ok) {
        throw new Error(`IdOS API error: ${response.statusText}`);
      }

      const data = await response.json() as IdOSVerificationAPIResponse;
      
      return {
        success: true,
        challengeUrl: data.verification_url,
        sessionId: data.session_id
      };
    } catch (error) {
      logger.error('IdOS initiation failed:', error);
      return {
        success: false,
        error: 'Failed to initiate IdOS verification'
      };
    }
  }

  async verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'IdOS adapter not configured'
        };
      }

      // Get verification result from IdOS
      const response = await fetch(`${this.apiBaseUrl}/v1/verification-sessions/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });

      if (!response.ok) {
        throw new Error(`IdOS status check failed: ${response.statusText}`);
      }

      const data = await response.json() as IdOSVerificationStatus;
      
      if (data.status === 'completed' && data.verified) {
        return {
          success: true,
          did: data.did,
          verificationId: sessionId,
          metadata: {
            verificationTimestamp: data.verified_at,
            credentialTypes: data.credential_types,
            socialAccounts: data.social_accounts,
            credentials: data.credentials
          }
        };
      } else if (data.status === 'failed') {
        return {
          success: false,
          error: data.error_message || 'Verification rejected'
        };
      } else {
        return {
          success: false,
          error: 'Verification in progress'
        };
      }
    } catch (error) {
      logger.error('IdOS callback verification failed:', error);
      return {
        success: false,
        error: 'Verification service unavailable'
      };
    }
  }
}