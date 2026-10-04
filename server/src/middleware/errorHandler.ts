import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SeatTakenError extends AppError {
  constructor(message: string = 'One or more requested seats are already taken', details?: any) {
    super(message, 409, 'SEAT_TAKEN', details);
  }
}

export class UserLimitExceededError extends AppError {
  constructor(message: string = 'Per-user booking limit exceeded for this show', details?: any) {
    super(message, 409, 'USER_LIMIT_EXCEEDED', details);
  }
}

export class IdempotencyMismatchError extends AppError {
  constructor(message: string = 'Idempotency key previously used with different request payload', details?: any) {
    super(message, 409, 'IDEMPOTENCY_MISMATCH', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  const reqId = req.id || req.headers['x-request-id'] || 'unknown';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
      request_id: reqId,
    });
    return;
  }

  // Handle JSON parsing syntax errors cleanly as 400 Bad Request
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    res.status(400).json({
      error: 'MALFORMED_JSON',
      message: 'Request body contains invalid JSON',
      request_id: reqId,
    });
    return;
  }

  // Handle Postgres deadlock or serialization errors gracefully as retryable 409
  if (err.code === '40P01' || err.code === '40001') {
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: 'Concurrent conflict occurred. Please retry your request.',
      request_id: reqId,
    });
    return;
  }

  // Log unexpected errors
  logger.error({
    err,
    reqId,
    url: req.url,
    method: req.method,
  }, 'Unhandled server error');

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred',
    request_id: reqId,
  });
}
