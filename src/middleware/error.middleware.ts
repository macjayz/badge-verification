// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error with context
  logger.error('Error occurred:', {
    error: error.message,
    code: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Handle AppError instances
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle generic errors (security: don't expose stack in production)
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An internal server error occurred' : error.message,
      details: isProduction ? undefined : { stack: error.stack },
      timestamp: new Date().toISOString()
    }
  });
}

// Async error handler wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};