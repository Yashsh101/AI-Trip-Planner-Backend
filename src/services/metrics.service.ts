export interface ProviderCallMetric {
  provider: string;
  operation: string;
  model?: string;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUSD?: number;
  recordedAt: string;
}

export interface ApiCallMetric {
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  ok: boolean;
  requestId?: string;
  recordedAt: string;
}

interface ProviderSummary {
  calls: number;
  failures: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

interface ApiSummary {
  calls: number;
  failures: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

class MetricsService {
  private readonly providerCalls: ProviderCallMetric[] = [];
  private readonly apiCalls: ApiCallMetric[] = [];
  private readonly maxEvents = 500;

  recordApiCall(metric: Omit<ApiCallMetric, 'recordedAt'>): void {
    this.apiCalls.push({ ...metric, recordedAt: new Date().toISOString() });
    this.trim(this.apiCalls);
  }

  recordProviderCall(metric: Omit<ProviderCallMetric, 'recordedAt'>): void {
    this.providerCalls.push({ ...metric, recordedAt: new Date().toISOString() });
    this.trim(this.providerCalls);
  }

  snapshot(): {
    generatedAt: string;
    api: Record<string, ApiSummary>;
    providers: Record<string, ProviderSummary>;
    recentApiFailures: ApiCallMetric[];
    recentFailures: ProviderCallMetric[];
  } {
    const api: Record<string, ApiSummary> = {};
    const providers: Record<string, ProviderSummary> = {};

    for (const call of this.apiCalls) {
      const key = `${call.method} ${call.route}`;
      const existing =
        api[key] ??
        ({
          calls: 0,
          failures: 0,
          totalLatencyMs: 0,
          avgLatencyMs: 0,
        } satisfies ApiSummary);

      existing.calls += 1;
      existing.failures += call.ok ? 0 : 1;
      existing.totalLatencyMs += call.latencyMs;
      existing.avgLatencyMs = Math.round(existing.totalLatencyMs / existing.calls);
      api[key] = existing;
    }

    for (const call of this.providerCalls) {
      const key = `${call.provider}.${call.operation}`;
      const existing =
        providers[key] ??
        ({
          calls: 0,
          failures: 0,
          totalLatencyMs: 0,
          avgLatencyMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUSD: 0,
        } satisfies ProviderSummary);

      existing.calls += 1;
      existing.failures += call.ok ? 0 : 1;
      existing.totalLatencyMs += call.latencyMs;
      existing.avgLatencyMs = Math.round(existing.totalLatencyMs / existing.calls);
      existing.promptTokens += call.promptTokens ?? 0;
      existing.completionTokens += call.completionTokens ?? 0;
      existing.totalTokens += call.totalTokens ?? 0;
      existing.estimatedCostUSD = Number((existing.estimatedCostUSD + (call.estimatedCostUSD ?? 0)).toFixed(6));
      providers[key] = existing;
    }

    return {
      generatedAt: new Date().toISOString(),
      api,
      providers,
      recentApiFailures: this.apiCalls.filter((call) => !call.ok).slice(-20),
      recentFailures: this.providerCalls.filter((call) => !call.ok).slice(-20),
    };
  }

  private trim<T>(values: T[]): void {
    if (values.length > this.maxEvents) {
      values.splice(0, values.length - this.maxEvents);
    }
  }
}

export const metricsService = new MetricsService();
