import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { aiOrchestratorService } from '../../src/services/ai-orchestrator.service';
import type { Itinerary } from '../../src/types';

const body = {
  destination: 'Tokyo, Japan',
  duration: 1,
  budget: 'mid',
  interests: ['food'],
  travelStyle: 'solo',
} as const;

const itinerary: Itinerary = {
  tripId: '96013b9f-2205-4f23-9e9f-9f3ad11c4e63',
  destination: 'Tokyo, Japan',
  duration: 1,
  budget: 'mid',
  travelStyle: 'solo',
  days: [],
  totalEstimatedCostUSD: 0,
  travelTips: [],
  bestTimeToVisit: 'Spring or autumn.',
  generatedAt: '2026-04-30T00:00:00.000Z',
  meta: {
    modelVersion: 'test',
    promptVersion: 'test',
    ragChunksUsed: 0,
    weatherDataUsed: false,
    fromCache: false,
    generationMs: 1,
  },
};

describe('async itinerary jobs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues and exposes job status through v1 routes', async () => {
    vi.spyOn(aiOrchestratorService, 'streamItinerary').mockImplementation(async function* () {
      yield { type: 'done', data: { itinerary } };
    });

    const app = createApp();
    const created = await request(app).post('/api/v1/itinerary/generate-async').send(body);

    expect(created.status).toBe(202);
    expect(created.body.job.id).toEqual(expect.any(String));
    expect(created.body.statusUrl).toContain('/api/v1/itinerary/jobs/');

    const status = await request(app).get(`/api/v1/itinerary/jobs/${created.body.job.id}`);
    expect(status.status).toBe(200);
    expect(['queued', 'running', 'succeeded']).toContain(status.body.job.status);
  });

  it('reuses jobs for matching idempotency keys', async () => {
    vi.spyOn(aiOrchestratorService, 'streamItinerary').mockImplementation(async function* () {
      yield { type: 'done', data: { itinerary } };
    });

    const app = createApp();
    const first = await request(app).post('/api/v1/itinerary/generate-async').set('idempotency-key', 'idem-1').send(body);
    const second = await request(app).post('/api/v1/itinerary/generate-async').set('idempotency-key', 'idem-1').send(body);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.job.id).toBe(first.body.job.id);
  });
});
