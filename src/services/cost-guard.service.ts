import { config } from '../config';
import { logger } from '../middleware/logger';
import { AppError } from '../types';

class CostGuardService {
  private currentDay = this.dayKey();
  private aiRequestsToday = 0;

  reserveAiGeneration(context?: { requestId?: string }): void {
    this.rollWindowIfNeeded();
    if (this.aiRequestsToday >= config.AI_DAILY_REQUEST_LIMIT) {
      logger.warn({
        event: 'ai_quota_blocked',
        requestId: context?.requestId,
        limit: config.AI_DAILY_REQUEST_LIMIT,
      });
      throw new AppError('Daily AI generation quota exceeded', 429, 'RATE_LIMITED', {
        limit: config.AI_DAILY_REQUEST_LIMIT,
      });
    }

    this.aiRequestsToday += 1;
    logger.info({
      event: 'ai_quota_reserved',
      requestId: context?.requestId,
      used: this.aiRequestsToday,
      limit: config.AI_DAILY_REQUEST_LIMIT,
    });
  }

  assertPromptWithinLimit(promptTokens: number | undefined, context?: { requestId?: string; model?: string }): void {
    if (promptTokens === undefined || promptTokens <= config.AI_MAX_PROMPT_TOKENS) return;

    logger.warn({
      event: 'ai_prompt_token_limit_blocked',
      requestId: context?.requestId,
      model: context?.model,
      promptTokens,
      limit: config.AI_MAX_PROMPT_TOKENS,
    });
    throw new AppError('AI prompt is too large for configured cost guardrails', 429, 'RATE_LIMITED', {
      promptTokens,
      limit: config.AI_MAX_PROMPT_TOKENS,
    });
  }

  snapshot(): { aiRequestsToday: number; aiDailyRequestLimit: number; aiMaxPromptTokens: number } {
    this.rollWindowIfNeeded();
    return {
      aiRequestsToday: this.aiRequestsToday,
      aiDailyRequestLimit: config.AI_DAILY_REQUEST_LIMIT,
      aiMaxPromptTokens: config.AI_MAX_PROMPT_TOKENS,
    };
  }

  private rollWindowIfNeeded(): void {
    const today = this.dayKey();
    if (today === this.currentDay) return;

    this.currentDay = today;
    this.aiRequestsToday = 0;
  }

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

export const costGuardService = new CostGuardService();
