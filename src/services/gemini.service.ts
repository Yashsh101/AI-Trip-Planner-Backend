import {
  GoogleGenerativeAI,
  type GenerationConfig,
  type GenerativeModel,
  type UsageMetadata,
} from '@google/generative-ai';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { logger } from '../middleware/logger';
import { AppError, type TripRequest } from '../types';
import { cacheService, CACHE_TTL_SECONDS } from './cache.service';
import { costGuardService } from './cost-guard.service';
import { metricsService } from './metrics.service';
import { circuitBreakers } from './reliability.service';

export const PROMPT_VERSION = 'v2_rag_grounded';

const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.55,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
};

class GeminiService {
  private readonly client: GoogleGenerativeAI;
  private readonly models = new Map<string, GenerativeModel>();
  private readonly promptTemplate: string;

  constructor() {
    this.client = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    this.promptTemplate = this.loadPrompt();
  }

  async *streamItinerary(
    request: TripRequest,
    ragContext: string,
    weatherContext: string,
    options?: { signal?: AbortSignal; requestId?: string },
  ): AsyncGenerator<string> {
    const prompt = this.buildPrompt(request, ragContext, weatherContext);
    const candidates = this.modelCandidates();
    const attempts: Array<{ model: string; attempt: number; message: string }> = [];

    for (const [modelIndex, modelVersion] of candidates.entries()) {
      for (let attempt = 1; attempt <= config.GEMINI_MAX_RETRIES + 1; attempt += 1) {
        const startedAt = Date.now();
        let emittedTokens = false;

        try {
          const model = this.getModel(modelVersion);
          const inputTokens = await this.countPromptTokens(model, prompt, modelVersion, options);
          costGuardService.assertPromptWithinLimit(inputTokens, { requestId: options?.requestId, model: modelVersion });
          const result = await circuitBreakers.gemini.execute(() =>
            model.generateContentStream(prompt, options?.signal ? { signal: options.signal } : undefined),
          );

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              emittedTokens = true;
              yield text;
            }
          }

          const usageMetadata = await this.safeReadUsageMetadata(result.response);
          this.recordSuccess({
            model: modelVersion,
            latencyMs: Date.now() - startedAt,
            usageMetadata,
            fallbackPromptTokens: inputTokens,
          });

          logger.info({
            event: 'gemini_generation_complete',
            generationMs: Date.now() - startedAt,
            model: modelVersion,
            attempt,
            requestId: options?.requestId,
            usageMetadata,
          });
          return;
        } catch (err) {
          const message = String(err);
          attempts.push({ model: modelVersion, attempt, message });

          if (options?.signal?.aborted) {
            throw new AppError('Gemini generation was aborted', 504, 'UPSTREAM_TIMEOUT', {
              model: modelVersion,
              attempt,
              cause: message,
            });
          }

          if (emittedTokens) {
            logger.error({
              event: 'gemini_generation_interrupted',
              model: modelVersion,
              attempt,
              requestId: options?.requestId,
              message,
            });
            this.recordFailure(modelVersion, Date.now() - startedAt, 'GEMINI_ERROR');
            throw new AppError('Gemini stream failed after partial output', 502, 'GEMINI_ERROR', {
              model: modelVersion,
              attempt,
              cause: message,
            });
          }

          const hasRetry = attempt <= config.GEMINI_MAX_RETRIES;
          if (hasRetry) {
            logger.warn({
              event: 'gemini_generation_retrying',
              model: modelVersion,
              attempt,
              requestId: options?.requestId,
              message,
            });
            this.recordFailure(modelVersion, Date.now() - startedAt, 'GEMINI_ERROR');
            await this.delayBeforeRetry(attempt, options?.signal);
            continue;
          }

          const hasFallback = modelIndex < candidates.length - 1;
          if (hasFallback) {
            logger.warn({
              event: 'gemini_generation_fallback',
              failedModel: modelVersion,
              fallbackModel: candidates[modelIndex + 1],
              requestId: options?.requestId,
              message,
            });
          }
          this.recordFailure(modelVersion, Date.now() - startedAt, 'GEMINI_ERROR');
          break;
        }
      }
    }

    logger.error({ event: 'gemini_generation_failed', requestId: options?.requestId, attempts });
    throw new AppError('Gemini failed to generate an itinerary', 502, 'GEMINI_ERROR', { attempts });
  }

  buildPrompt(request: TripRequest, ragContext: string, weatherContext: string): string {
    return this.promptTemplate
      .replaceAll('{{DESTINATION}}', request.destination)
      .replaceAll('{{DURATION}}', String(request.duration))
      .replaceAll('{{BUDGET}}', request.budget)
      .replaceAll('{{INTERESTS}}', request.interests.join(', '))
      .replaceAll('{{TRAVEL_STYLE}}', request.travelStyle)
      .replaceAll('{{START_DATE}}', request.startDate ?? 'not specified')
      .replaceAll('{{RAG_CONTEXT}}', ragContext || 'No retrieved knowledge chunks available.')
      .replaceAll('{{WEATHER_CONTEXT}}', weatherContext);
  }

  private loadPrompt(): string {
    const candidates = [
      join(process.cwd(), 'src', 'prompts', `${PROMPT_VERSION}.txt`),
      join(process.cwd(), 'dist', 'src', 'prompts', `${PROMPT_VERSION}.txt`),
    ];
    const path = candidates.find((candidate) => existsSync(candidate));
    if (!path) {
      throw new AppError('Prompt template is missing', 500, 'INTERNAL_ERROR', { prompt: PROMPT_VERSION });
    }

    return readFileSync(path, 'utf-8');
  }

  private getModel(modelVersion: string): GenerativeModel {
    const cached = this.models.get(modelVersion);
    if (cached) return cached;

    const model = this.client.getGenerativeModel({
      model: modelVersion,
      generationConfig: GENERATION_CONFIG,
    });
    this.models.set(modelVersion, model);
    return model;
  }

  private modelCandidates(): string[] {
    return [config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODEL]
      .filter((model): model is string => Boolean(model?.trim()))
      .filter((model, index, values) => values.indexOf(model) === index);
  }

  private async delayBeforeRetry(attempt: number, signal?: AbortSignal): Promise<void> {
    const delayMs = config.GEMINI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AppError('Gemini generation was aborted', 504, 'UPSTREAM_TIMEOUT'));
        return;
      }

      const timeout = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new AppError('Gemini generation was aborted', 504, 'UPSTREAM_TIMEOUT'));
        },
        { once: true },
      );
    });
  }

  private async countPromptTokens(
    model: GenerativeModel,
    prompt: string,
    modelVersion: string,
    options?: { signal?: AbortSignal; requestId?: string },
  ): Promise<number | undefined> {
    try {
      const cacheKey = cacheService.key('aiDeterministic', { operation: 'countTokens', model: modelVersion, prompt });
      return cacheService.getOrSet(cacheKey, CACHE_TTL_SECONDS.aiDeterministic, async () => {
        const response = await model.countTokens(prompt, options?.signal ? { signal: options.signal } : undefined);
        return response.totalTokens;
      });
    } catch (err) {
      logger.debug({
        event: 'gemini_count_tokens_unavailable',
        model: modelVersion,
        requestId: options?.requestId,
        message: String(err),
      });
      return undefined;
    }
  }

  private async safeReadUsageMetadata(response: Promise<{ usageMetadata?: UsageMetadata }>): Promise<UsageMetadata | undefined> {
    try {
      return (await response).usageMetadata;
    } catch {
      return undefined;
    }
  }

  private recordSuccess(input: {
    model: string;
    latencyMs: number;
    usageMetadata?: UsageMetadata;
    fallbackPromptTokens?: number;
  }): void {
    const promptTokens = input.usageMetadata?.promptTokenCount ?? input.fallbackPromptTokens;
    const completionTokens = input.usageMetadata?.candidatesTokenCount;
    metricsService.recordProviderCall({
      provider: 'gemini',
      operation: 'generate_itinerary',
      model: input.model,
      latencyMs: input.latencyMs,
      ok: true,
      promptTokens,
      completionTokens,
      totalTokens: input.usageMetadata?.totalTokenCount,
      estimatedCostUSD: this.estimateCost(promptTokens, completionTokens),
    });
  }

  private recordFailure(model: string, latencyMs: number, errorCode: string): void {
    metricsService.recordProviderCall({
      provider: 'gemini',
      operation: 'generate_itinerary',
      model,
      latencyMs,
      ok: false,
      errorCode,
    });
  }

  private estimateCost(promptTokens?: number, completionTokens?: number): number | undefined {
    if (promptTokens === undefined && completionTokens === undefined) return undefined;

    const inputCost = ((promptTokens ?? 0) / 1_000_000) * config.GEMINI_INPUT_COST_PER_1M_TOKENS;
    const outputCost = ((completionTokens ?? 0) / 1_000_000) * config.GEMINI_OUTPUT_COST_PER_1M_TOKENS;
    return Number((inputCost + outputCost).toFixed(6));
  }
}

export const geminiService = new GeminiService();
