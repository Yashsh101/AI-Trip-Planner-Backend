import express from 'express';
import helmet from 'helmet';
import { apiMetricsMiddleware } from './middleware/apiMetrics';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/logger';
import { apiRateLimiter } from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';
import { routes } from './routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(httpLogger);
  app.use(apiMetricsMiddleware);
  app.use(apiRateLimiter);

  app.use('/api/v1', routes);
  app.use('/api', routes);
  app.use(errorHandler);

  return app;
}
