import { randomUUID } from 'crypto';
import { getFirestore } from '../config/firebase';
import { config } from '../config';
import { logger } from '../middleware/logger';
import { GeminiItinerarySchema } from '../schemas/itinerary.schema';
import { AppError, type Activity, type Itinerary, type TripRequest } from '../types';
import { aiSafetyService } from './ai-safety.service';
import { cacheService } from './cache.service';
import { costGuardService } from './cost-guard.service';
import { geminiService, PROMPT_VERSION } from './gemini.service';
import { mapsService } from './maps.service';
import { ragService } from './rag.service';
import { timeoutSignal } from './reliability.service';
import { weatherService } from './weather.service';

const MAX_BUFFER_CHARS = 400_000;

export type AiOrchestrationEvent =
  | {
      type: 'meta';
      data: {
        tripId: string;
        ragChunksUsed: number;
        weatherDataUsed: boolean;
        promptVersion: string;
        modelVersion: string;
      };
    }
  | { type: 'token'; data: { text: string } }
  | { type: 'done'; data: { itinerary: Itinerary } };

class AiOrchestratorService {
  async getCachedItinerary(request: TripRequest, startedAt = Date.now()): Promise<Itinerary | null> {
    aiSafetyService.assertSafeTripRequest(request);
    const cached = await cacheService.get<Itinerary>(this.buildCacheKey(request));
    if (!cached) return null;

    return {
      ...cached,
      meta: {
        ...cached.meta,
        fromCache: true,
        generationMs: Date.now() - startedAt,
      },
    };
  }

  async *streamItinerary(
    request: TripRequest,
    options?: { signal?: AbortSignal; requestId?: string },
  ): AsyncGenerator<AiOrchestrationEvent> {
    const startedAt = Date.now();
    const signal = timeoutSignal(config.GEMINI_STREAM_TIMEOUT_MS, options?.signal);
    const cacheKey = this.buildCacheKey(request);
    aiSafetyService.assertSafeTripRequest(request);
    costGuardService.reserveAiGeneration({ requestId: options?.requestId });
    logger.info({
      event: 'ai_orchestration_started',
      requestId: options?.requestId,
      destination: request.destination,
      duration: request.duration,
      model: config.GEMINI_MODEL,
      promptVersion: PROMPT_VERSION,
    });

    const [rag, weather] = await Promise.all([
      ragService.retrieve(
        `${request.destination} ${request.interests.join(' ')} ${request.budget} ${request.travelStyle}`,
        request.destination,
      ),
      weatherService.forecast(request.destination, request.startDate, { signal }),
    ]);

    const tripId = randomUUID();
    yield {
      type: 'meta',
      data: {
        tripId,
        ragChunksUsed: rag.count,
        weatherDataUsed: weather.length > 0,
        promptVersion: PROMPT_VERSION,
        modelVersion: config.GEMINI_MODEL,
      },
    };

    let buffer = '';
    for await (const token of geminiService.streamItinerary(
      request,
      rag.context,
      weatherService.toPromptContext(weather),
      { ...options, signal },
    )) {
      if (Date.now() - startedAt > config.GEMINI_STREAM_TIMEOUT_MS) {
        throw new AppError('Gemini stream timed out', 504, 'UPSTREAM_TIMEOUT', {
          maxStreamMs: config.GEMINI_STREAM_TIMEOUT_MS,
        });
      }

      buffer += token;
      if (buffer.length > MAX_BUFFER_CHARS) {
        throw new AppError('Gemini output too large', 502, 'UPSTREAM_BUFFER_LIMIT_EXCEEDED', {
          maxBufferChars: MAX_BUFFER_CHARS,
        });
      }

      yield { type: 'token', data: { text: token } };
    }

    const itinerary = await this.finaliseItinerary(
      buffer,
      tripId,
      request,
      rag.count,
      weather.length > 0,
      startedAt,
    );

    logger.info({
      event: 'ai_orchestration_completed',
      requestId: options?.requestId,
      tripId,
      generationMs: Date.now() - startedAt,
      ragChunksUsed: rag.count,
      weatherDataUsed: weather.length > 0,
    });

    void Promise.all([cacheService.set(cacheKey, itinerary), this.persistTrip(itinerary)]).catch((err) => {
      logger.warn({ event: 'itinerary_post_process_failed', tripId: itinerary.tripId, message: String(err) });
    });

    yield { type: 'done', data: { itinerary } };
  }

  private buildCacheKey(request: TripRequest): string {
    return cacheService.buildKey({
      destination: request.destination,
      duration: request.duration,
      budget: request.budget,
      interests: request.interests,
      travelStyle: request.travelStyle,
      startDate: request.startDate,
      promptVersion: PROMPT_VERSION,
      modelVersion: config.GEMINI_MODEL,
    });
  }

  private async finaliseItinerary(
    rawJson: string,
    tripId: string,
    request: TripRequest,
    ragChunksUsed: number,
    weatherDataUsed: boolean,
    startedAt: number,
  ): Promise<Itinerary> {
    const parsedJson = this.parseGeminiJson(rawJson);
    const parsed = GeminiItinerarySchema.safeParse(parsedJson);

    if (!parsed.success) {
      throw new AppError('Gemini returned JSON that failed schema validation', 502, 'GEMINI_JSON_PARSE_ERROR', {
        issues: parsed.error.flatten(),
      });
    }

    if (parsed.data.days.length !== request.duration) {
      throw new AppError('Gemini returned the wrong number of itinerary days', 502, 'GEMINI_JSON_PARSE_ERROR', {
        expected: request.duration,
        received: parsed.data.days.length,
      });
    }

    const itinerary: Itinerary = {
      tripId,
      destination: request.destination,
      duration: request.duration,
      budget: request.budget,
      travelStyle: request.travelStyle,
      ...parsed.data,
      generatedAt: new Date().toISOString(),
      meta: {
        modelVersion: config.GEMINI_MODEL,
        promptVersion: PROMPT_VERSION,
        ragChunksUsed,
        weatherDataUsed,
        fromCache: false,
        generationMs: Date.now() - startedAt,
      },
    };

    return this.enrichCoordinates(itinerary);
  }

  private parseGeminiJson(rawJson: string): unknown {
    const sanitized = aiSafetyService.sanitizeModelJson(rawJson);
    try {
      return JSON.parse(sanitized);
    } catch {
      const repaired = aiSafetyService.extractLikelyJsonObject(sanitized);
      if (repaired) {
        try {
          return JSON.parse(repaired);
        } catch {
          // fall through to typed parser error below
        }
      }

      throw new AppError('Gemini returned invalid JSON', 502, 'GEMINI_JSON_PARSE_ERROR', {
        preview: sanitized.slice(0, 500),
      });
    }
  }

  private async enrichCoordinates(itinerary: Itinerary): Promise<Itinerary> {
    const cache = new Map<string, Promise<Activity>>();
    const enrich = (activity: Activity) => {
      const key = `${activity.name}|${activity.location}`.toLowerCase();
      const cached = cache.get(key);
      if (cached) return cached;

      const promise = mapsService.enrichActivity(itinerary.destination, activity);
      cache.set(key, promise);
      return promise;
    };

    const days: Itinerary['days'] = [];
    for (const [index, day] of itinerary.days.entries()) {
      days.push({
        ...day,
        morning: await this.enrichActivityBatch(day.morning, enrich, index * 3),
        afternoon: await this.enrichActivityBatch(day.afternoon, enrich, index * 3 + 1),
        evening: await this.enrichActivityBatch(day.evening, enrich, index * 3 + 2),
      });
    }

    return { ...itinerary, days };
  }

  private async enrichActivityBatch(
    activities: Activity[],
    enrich: (activity: Activity) => Promise<Activity>,
    batchOffset: number,
  ): Promise<Activity[]> {
    const enriched: Activity[] = [];
    for (let i = 0; i < activities.length; i += 1) {
      if (batchOffset + i >= 30) {
        enriched.push(activities[i]);
        continue;
      }

      enriched.push(await enrich(activities[i]));
    }

    return enriched;
  }

  private async persistTrip(itinerary: Itinerary): Promise<void> {
    try {
      await getFirestore().collection('trips').doc(itinerary.tripId).set(itinerary);
      logger.info({ event: 'trip_persisted', tripId: itinerary.tripId });
    } catch (err) {
      logger.warn({ event: 'trip_persist_failed', tripId: itinerary.tripId, message: String(err) });
    }
  }
}

export const aiOrchestratorService = new AiOrchestratorService();
