import { 
    DIDAdapter, 
    DIDVerificationRequest, 
    DIDVerificationResponse, 
    DIDVerificationResult 
  } from './DIDAdapter.interface';
  
  export abstract class BaseStubAdapter implements DIDAdapter {
    protected adapterName: string;
    protected available: boolean = true;
  
    constructor(name: string) {
      this.adapterName = name;
    }
  
    abstract initVerification(request: DIDVerificationRequest): Promise<DIDVerificationResponse>;
    abstract verifyCallback(payload: any, sessionId?: string): Promise<DIDVerificationResult>;
  
    getName(): string {
      return this.adapterName;
    }
  
    isAvailable(): boolean {
      return this.available;
    }
  
    protected generateMockDID(wallet: string): string {
      return `did:mock:${this.adapterName.toLowerCase()}:${wallet.substring(2).toLowerCase()}`;
    }
  
    protected generateSessionId(): string {
      return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }