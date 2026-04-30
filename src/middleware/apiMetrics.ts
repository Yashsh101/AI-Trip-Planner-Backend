import type { NextFunction, Request, Response } from 'express';
import { metricsService } from '../services/metrics.service';
import { getRequestId } from './requestId';

export function apiMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    metricsService.recordApiCall({
      method: req.method,
      route: req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.path,
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ok: res.statusCode < 500,
      requestId: getRequestId(req),
    });
  });

  next();
}
