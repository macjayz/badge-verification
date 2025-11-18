import { DIDAdapter, DIDVerificationRequest, DIDVerificationResponse, DIDVerificationResult } from './DIDAdapter.interface';
import { logger } from '../../utils/logger';

interface PolygonIDVerificationAPIResponse {
  session_id: string;
  verification_url: string;
  qr_code?: string;
  expires_at?: string;
}

interface PolygonIDVerificationStatus {
  status: 'verified' | 'failed' | 'pending';
  did?: string;
  credentials?: any[];
  verification_level?: string;
  issued_at?: string;
  expires_at?: string;
  reason?: string;
}

interface PolygonIDTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class PolygonIDRealAdapter implements DIDAdapter {
  readonly name = 'polygonid';
  private readonly apiBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.apiBaseUrl = process.env.POLYGONID_API_URL || 'https://api.polygonid.com';
    this.clientId = process.env.POLYGONID_CLIENT_ID!;
    this.clientSecret = process.env.POLYGONID_CLIENT_SECRET!;
    
    if (!this.clientId || !this.clientSecret) {
      logger.warn('Polygon ID credentials not configured - using fallback mode');
    }
  }

  getName(): string {
    return this.name;
  }

  isAvailable(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'Polygon ID adapter not configured'
        };
      }

      const token = await this.getAccessToken();

      // Create verification session with Polygon ID
      const response = await fetch(`${this.apiBaseUrl}/v1/verifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: request.wallet,
          callback_url: request.callbackUrl,
          claims: ['basic_identity', 'kyc_level1'],
          expires_in: 900 // 15 minutes
        })
      });

      if (!response.ok) {
        throw new Error(`Polygon ID API error: ${response.statusText}`);
      }

      const data = await response.json() as PolygonIDVerificationAPIResponse;
      
      return {
        success: true,
        challengeUrl: data.verification_url,
        qrCode: data.qr_code,
        sessionId: data.session_id
      };
    } catch (error) {
      logger.error('Polygon ID initiation failed:', error);
      return {
        success: false,
        error: 'Failed to initiate Polygon ID verification'
      };
    }
  }

  async verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult> {
    try {
      if (!this.isAvailable()) {
        return {
          success: false,
          error: 'Polygon ID adapter not configured'
        };
      }

      const token = await this.getAccessToken();
      
      // Check verification status with Polygon ID
      const response = await fetch(`${this.apiBaseUrl}/v1/verifications/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        throw new Error(`Polygon ID status check failed: ${response.statusText}`);
      }

      const data = await response.json() as PolygonIDVerificationStatus;
      
      if (data.status === 'verified') {
        return {
          success: true,
          did: data.did,
          verificationId: sessionId,
          metadata: {
            verificationLevel: data.verification_level,
            issuedAt: data.issued_at,
            expiresAt: data.expires_at,
            credentials: data.credentials
          }
        };
      } else if (data.status === 'failed') {
        return {
          success: false,
          error: data.reason || 'Verification failed'
        };
      } else {
        return {
          success: false,
          error: 'Verification pending'
        };
      }
    } catch (error) {
      logger.error('Polygon ID callback verification failed:', error);
      return {
        success: false,
        error: 'Verification service unavailable'
      };
    }
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch(`${this.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get Polygon ID access token');
    }

    const data = await response.json() as PolygonIDTokenResponse;
    return data.access_token;
  }
}