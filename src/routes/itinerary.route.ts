import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams } from '../middleware/validate';
import { itineraryRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../middleware/logger';
import { initSse, writeDone, writeError, writeMeta, writeToken } from '../services/sse/sseWriter';
import { AppError, type TripRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ItineraryEvaluationSchema, TripSchema } from '../schemas/itinerary.schema';
import { aiOrchestratorService } from '../services/ai-orchestrator.service';
import { getRequestId } from '../middleware/requestId';
import { itineraryEvaluatorService } from '../services/itinerary-evaluator.service';
import { jobQueueService } from '../services/job-queue.service';

export { TripSchema } from '../schemas/itinerary.schema';

export const itineraryRouter = Router();
const JobParamsSchema = z.object({ id: z.string().uuid() });

itineraryRouter.post(
  '/generate',
  itineraryRateLimiter,
  validateBody(TripSchema),
  asyncHandler(async (req, res) => {
    const tripRequest = req.body as TripRequest;
    const startedAt = Date.now();
    const requestId = getRequestId(req);
    const cached = await aiOrchestratorService.getCachedItinerary(tripRequest, startedAt);

    if (cached) {
      res.json({ itinerary: cached });
      return;
    }

    let sseStarted = false;

    try {
      initSse(res);
      sseStarted = true;
      logger.info({ event: 'sse_stream_started', requestId, route: 'itinerary.generate' });

      for await (const event of aiOrchestratorService.streamItinerary(tripRequest, { requestId })) {
        if (event.type === 'meta') writeMeta(res, event.data);
        if (event.type === 'token') writeToken(res, event.data);
        if (event.type === 'done') writeDone(res, event.data);
      }

      res.end();
      logger.info({
        event: 'sse_stream_completed',
        requestId,
        route: 'itinerary.generate',
        streamMs: Date.now() - startedAt,
      });
    } catch (err) {
      const appError =
        err instanceof AppError
          ? err
          : new AppError('Failed to generate itinerary', 500, 'INTERNAL_ERROR', { message: String(err) });

      // SSE safety: once headers are sent, never delegate to JSON error middleware.
      if (sseStarted || res.headersSent) {
        writeError(res, { code: appError.code, message: appError.message, details: appError.details });
        if (!res.writableEnded) res.end();
        logger.error({
          event: 'itinerary_stream_failed',
          requestId,
          code: appError.code,
          message: appError.message,
          streamMs: Date.now() - startedAt,
        });
        return;
      }

      // Pre-SSE errors: let global error handler handle it.
      throw appError;
    }
  }),
);

itineraryRouter.post(
  '/generate-async',
  itineraryRateLimiter,
  validateBody(TripSchema),
  asyncHandler(async (req, res) => {
    const job = jobQueueService.enqueueItinerary(req.body as TripRequest, {
      idempotencyKey: req.header('idempotency-key'),
      requestId: getRequestId(req),
    });

    res.status(202).json({
      job,
      statusUrl: `/api/v1/itinerary/jobs/${job.id}`,
    });
  }),
);

itineraryRouter.get(
  '/jobs/:id',
  validateParams(JobParamsSchema),
  asyncHandler(async (req, res) => {
    const job = jobQueueService.get(req.params.id);
    if (!job) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }

    res.json({ job });
  }),
);

itineraryRouter.post(
  '/evaluate',
  validateBody(ItineraryEvaluationSchema),
  asyncHandler(async (req, res) => {
    const score = await itineraryEvaluatorService.evaluate(req.body.itinerary, req.body.request);
    res.json({ score });
  }),
);
