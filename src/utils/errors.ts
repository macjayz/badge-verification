// src/utils/errors.ts
export class AppError extends Error {
    constructor(
      public message: string,
      public code: string,
      public statusCode: number = 500,
      public details?: any
    ) {
      super(message);
      this.name = this.constructor.name;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 'VALIDATION_ERROR', 400, details);
    }
  }
  
  export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed') {
      super(message, 'AUTH_ERROR', 401);
    }
  }
  
  export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
      super(message, 'AUTHORIZATION_ERROR', 403);
    }
  }
  
  export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
      super(
        `${resource}${id ? ` with ID ${id}` : ''} not found`,
        'NOT_FOUND_ERROR',
        404,
        { resource, id }
      );
    }
  }
  
  export class BlockchainError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 'BLOCKCHAIN_ERROR', 502, details);
    }
  }
  
  export class DIDProviderError extends AppError {
    constructor(provider: string, message: string, details?: any) {
      super(`DID Provider (${provider}) error: ${message}`, 'DID_PROVIDER_ERROR', 502, {
        provider,
        ...details
      });
    }
  }
  
  export class EligibilityError extends AppError {
    constructor(badgeType: string, message: string, details?: any) {
      super(`Eligibility check failed for ${badgeType}: ${message}`, 'ELIGIBILITY_ERROR', 400, {
        badgeType,
        ...details
      });
    }
  }
  
  export class MintingError extends AppError {
    constructor(message: string, transactionHash?: string, details?: any) {
      super(`Minting failed: ${message}`, 'MINTING_ERROR', 502, {
        transactionHash,
        ...details
      });
    }
  }
  
  export class ConfigurationError extends AppError {
    constructor(service: string, message: string) {
      super(`${service} configuration error: ${message}`, 'CONFIGURATION_ERROR', 500, {
        service
      });
    }
  }