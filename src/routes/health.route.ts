import { Router } from 'express';
import { isFirebaseConfigured } from '../config/firebase';
import { asyncHandler } from '../utils/asyncHandler';
import { cacheService } from '../services/cache.service';
import { ragService } from '../services/rag.service';
import { metricsService } from '../services/metrics.service';
import { costGuardService } from '../services/cost-guard.service';
import { circuitBreakers } from '../services/reliability.service';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const services = {
      cache: cacheService.isAvailable() ? 'ok' : 'degraded',
      cacheBackend: cacheService.backend(),
      firestore: isFirebaseConfigured() ? 'ok' : 'degraded',
      rag: ragService.isReady() ? 'ok' : 'degraded',
    };

    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      services,
    });
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks = {
      cache: cacheService.isAvailable(),
      firestore: isFirebaseConfigured(),
      rag: ragService.isReady(),
    };
    const ready = Object.values(checks).every(Boolean);

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      checks,
      uptime: process.uptime(),
    });
  }),
);

healthRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      ...metricsService.snapshot(),
      costGuardrails: costGuardService.snapshot(),
      circuitBreakers: {
        gemini: circuitBreakers.gemini.snapshot(),
        weather: circuitBreakers.weather.snapshot(),
        maps: circuitBreakers.maps.snapshot(),
      },
    });
  }),
);
