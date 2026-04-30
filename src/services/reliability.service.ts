import { config } from '../config';
import { logger } from '../middleware/logger';
import { AppError } from '../types';

type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(private readonly name: string) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < config.CIRCUIT_BREAKER_RESET_MS) {
        throw new AppError(`${this.name} circuit is open`, 503, 'CIRCUIT_OPEN', {
          provider: this.name,
          retryAfterMs: config.CIRCUIT_BREAKER_RESET_MS - elapsed,
        });
      }
      this.state = 'half-open';
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  snapshot(): { state: CircuitState; failures: number; openedAt: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt ? this.openedAt : null,
    };
  }

  private recordSuccess(): void {
    if (this.state !== 'closed' || this.failures > 0) {
      logger.info({ event: 'circuit_breaker_closed', provider: this.name });
    }
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
  }

  private recordFailure(err: unknown): void {
    this.failures += 1;
    if (this.failures < config.CIRCUIT_BREAKER_FAILURE_THRESHOLD) return;

    this.state = 'open';
    this.openedAt = Date.now();
    logger.warn({
      event: 'circuit_breaker_opened',
      provider: this.name,
      failures: this.failures,
      message: String(err),
    });
  }
}

export class RetryPolicy {
  constructor(
    private readonly retries: number,
    private readonly baseDelayMs: number,
  ) {}

  async execute<T>(operation: (attempt: number) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retries + 1; attempt += 1) {
      try {
        return await operation(attempt);
      } catch (err) {
        lastError = err;
        if (attempt > this.retries) break;
        await this.delay(attempt, signal);
      }
    }

    throw lastError;
  }

  private async delay(attempt: number, signal?: AbortSignal): Promise<void> {
    const delayMs = this.baseDelayMs * 2 ** (attempt - 1);
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AppError('Provider operation was aborted', 504, 'UPSTREAM_TIMEOUT'));
        return;
      }

      const timeout = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new AppError('Provider operation was aborted', 504, 'UPSTREAM_TIMEOUT'));
        },
        { once: true },
      );
    });
  }
}

export function timeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  parent?.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout);
      controller.abort();
    },
    { once: true },
  );

  controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

export const circuitBreakers = {
  gemini: new CircuitBreaker('gemini'),
  weather: new CircuitBreaker('weather'),
  maps: new CircuitBreaker('maps'),
};
