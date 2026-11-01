import { DIDAdapter, DIDVerificationRequest, DIDVerificationResponse, DIDVerificationResult } from './DIDAdapter.interface';
import { logger } from '../../utils/logger';

/**
 * Privado ID (formerly Polygon ID) through its hosted verifier backend.
 *
 * initVerification creates a session that asks the user's Privado ID wallet for a zero-knowledge
 * proof of a credential. The wallet sends that proof to the verifier backend, which checks it;
 * verifyCallback then reads the outcome from /status. The user's DID is the sender ("from") of
 * the signed authorization response the backend returns.
 */

const DEFAULT_BASE_URL = 'https://verifier-backend.privado.id';
const KYC_AGE_CONTEXT = 'https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld';

interface SignInResponse {
  qrCode: string; // iden3comm:// link for the wallet
  sessionID: string;
}

interface StatusResponse {
  status: 'pending' | 'success' | 'error';
  jwz: string | null;
  message: string | null;
}

/** The DID that signed a JWZ token: header.payload.proof, payload being the authorization response. */
export function didFromJwz(jwz: string): string | undefined {
  const payload = jwz.split('.')[1];
  if (!payload) return undefined;
  try {
    const message = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof message.from === 'string' && message.from.startsWith('did:') ? message.from : undefined;
  } catch {
    return undefined;
  }
}

export class PrivadoIDRealAdapter implements DIDAdapter {
  readonly name = 'privadoid';
  private readonly baseUrl = (process.env.PRIVADO_VERIFIER_API_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  private readonly apiKey = process.env.PRIVADO_API_KEY;

  getName(): string {
    return this.name;
  }

  isAvailable(): boolean {
    // The hosted verifier backend works without a key.
    return true;
  }

  /** The proof request: which credential, from which issuers, and what it must show. */
  buildSignInRequest() {
    const type = process.env.PRIVADO_CREDENTIAL_TYPE || 'KYCAgeCredential';
    const context = process.env.PRIVADO_CREDENTIAL_CONTEXT || KYC_AGE_CONTEXT;
    const allowedIssuers = (process.env.PRIVADO_ALLOWED_ISSUERS || '*')
      .split(',')
      .map(issuer => issuer.trim())
      .filter(Boolean);

    // Default: a KYC age credential proving the holder is at least 18, without revealing the birthday.
    let credentialSubject: Record<string, unknown> = {};
    if (process.env.PRIVADO_CREDENTIAL_SUBJECT) {
      credentialSubject = JSON.parse(process.env.PRIVADO_CREDENTIAL_SUBJECT);
    } else if (type === 'KYCAgeCredential') {
      credentialSubject = { birthday: { $lt: Number(`${new Date().getUTCFullYear() - 18}0101`) } };
    }

    return {
      chainID: process.env.PRIVADO_CHAIN_ID || '80002',
      skipClaimRevocationCheck: false,
      scope: [
        {
          circuitId: 'credentialAtomicQuerySigV2',
          id: 1,
          query: { allowedIssuers, context, type, credentialSubject }
        }
      ]
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }

  async initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/sign-in`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.buildSignInRequest())
      });

      if (!response.ok) {
        const detail = await response.text();
        logger.error('Privado ID sign-in request failed', { status: response.status, detail });
        return {
          success: false,
          error: response.status === 429
            ? 'Privado ID is rate limiting requests, try again shortly'
            : `Privado ID rejected the request (${response.status})`
        };
      }

      const data = (await response.json()) as SignInResponse;
      logger.info('Privado ID session created', { wallet: request.wallet, sessionId: data.sessionID });
      return { success: true, sessionId: data.sessionID, qrCode: data.qrCode, challengeUrl: data.qrCode };
    } catch (error: any) {
      logger.error('Privado ID sign-in request failed', { error: error.message });
      return { success: false, error: 'Privado ID is unreachable' };
    }
  }

  async verifyCallback(_payload: any, sessionId?: string): Promise<DIDVerificationResult> {
    if (!sessionId) {
      return { success: false, error: 'Session ID is required' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/status?sessionID=${encodeURIComponent(sessionId)}`, {
        headers: this.headers()
      });

      if (!response.ok) {
        logger.warn('Privado ID status check failed', { status: response.status, sessionId });
        return {
          success: false,
          error: response.status === 404 || response.status === 400
            ? 'Verification session not found or expired'
            : `Privado ID status check failed (${response.status})`
        };
      }

      const data = (await response.json()) as StatusResponse;

      if (data.status === 'pending') {
        return { success: false, pending: true, error: 'Waiting for the proof from the Privado ID wallet' };
      }

      if (data.status !== 'success') {
        return { success: false, error: data.message || 'Privado ID rejected the proof' };
      }

      // Never invent a DID: without one the verification cannot be tied to an identity.
      const did = data.jwz ? didFromJwz(data.jwz) : undefined;
      if (!did) {
        logger.error('Privado ID reported success without a readable DID', { sessionId });
        return { success: false, error: 'Privado ID did not return the holder DID' };
      }

      return {
        success: true,
        did,
        verificationId: sessionId,
        metadata: {
          provider: 'privadoid',
          credentialType: this.buildSignInRequest().scope[0].query.type,
          verifiedAt: new Date().toISOString()
        }
      };
    } catch (error: any) {
      logger.error('Privado ID status check failed', { sessionId, error: error.message });
      return { success: false, error: 'Privado ID is unreachable' };
    }
  }
}
