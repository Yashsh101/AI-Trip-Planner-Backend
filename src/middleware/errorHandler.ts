import type { ErrorRequestHandler } from 'express';
import { AppError } from '../types';
import { config } from '../config';
import { logger } from './logger';
import { getRequestId } from './requestId';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError('Unexpected server error', 500, 'INTERNAL_ERROR', { message: String(err) });
  const requestId = getRequestId(req);

  logger.error({
    event: 'request_error',
    requestId,
    code: appError.code,
    statusCode: appError.statusCode,
    message: appError.message,
    details: appError.details,
  });

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
      details: safeDetails(appError),
    },
  });
};

function safeDetails(error: AppError): unknown {
  if (config.NODE_ENV !== 'production') return error.details;
  if (error.code === 'VALIDATION_ERROR' || error.code === 'RATE_LIMITED') return error.details;
  return undefined;
}
