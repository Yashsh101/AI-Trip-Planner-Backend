import pino from 'pino';
import pinoHttp from 'pino-http';
import { getRequestId } from './requestId';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'ai-trip-planner-backend',
    env: process.env.NODE_ENV ?? 'development',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'GEMINI_API_KEY',
      'FIREBASE_PRIVATE_KEY',
      '*.apiKey',
      '*.privateKey',
    ],
    remove: true,
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => getRequestId(req) ?? req.id,
  customProps: (req) => ({
    requestId: getRequestId(req),
  }),
  customSuccessMessage: () => 'request completed',
  customErrorMessage: () => 'request failed',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
