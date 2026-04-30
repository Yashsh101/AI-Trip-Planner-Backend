import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cacheService } from '../../src/services/cache.service';

const PROMPT_VERSION = 'v2_rag_grounded';
const GEMINI_MODEL = 'gemini-1.5-flash';

function buildKeyInput(input: {
  destination: string;
  duration: number;
  budget: 'budget' | 'mid' | 'luxury';
  interests: string[];
  travelStyle: 'solo' | 'couple' | 'family' | 'group';
  startDate?: string;
}) {
  return {
    ...input,
    promptVersion: PROMPT_VERSION,
    modelVersion: GEMINI_MODEL,
  };
}

describe('cacheService.buildKey', () => {
  it('normalises destination to lowercase with hyphens (exact key match)', () => {
    const key = cacheService.buildKey(
      buildKeyInput({
        destination: 'Paris, France',
        duration: 5,
        budget: 'mid',
        interests: ['Food'],
        travelStyle: 'solo',
        // missing => stable representation
        startDate: undefined,
      }),
    );

    expect(key).toBe('itinerary:paris-france:5d:mid:solo:food:none:v2_rag_grounded:gemini-1.5-flash');
  });

  it('same inputs = same key', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food', 'history'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food', 'history'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    expect(a).toBe(b);
  });

  it('reordered interests = same key', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food', 'history'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['history', 'food'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    expect(a).toBe(b);
  });

  it('different interests = different key', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food', 'nature'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    expect(a).not.toBe(b);
  });

  it('different travelStyle = different key', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'couple',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    expect(a).not.toBe(b);
  });

  it('different startDate = different key (weather-dependent correctness)', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        startDate: '2026-08-02T00:00:00.000Z',
      }),
    );

    expect(a).not.toBe(b);
  });

  it('missing startDate is stable (same key across undefined inputs)', () => {
    const a = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        startDate: undefined,
      }),
    );

    const b = cacheService.buildKey(
      buildKeyInput({
        destination: 'Tokyo, Japan',
        duration: 5,
        budget: 'mid',
        interests: ['food'],
        travelStyle: 'solo',
        // intentionally missing
        startDate: undefined,
      }),
    );

    expect(a).toBe(b);
  });
});

describe('cacheService runtime behavior', () => {
  beforeAll(async () => {
    await cacheService.connect();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  it('uses the memory backend in tests', () => {
    expect(cacheService.backend()).toBe('memory');
    expect(cacheService.isAvailable()).toBe(true);
  });

  it('avoids repeated loader calls on cache hits', async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    const key = cacheService.key('weather', { destination: 'tokyo', startDate: 'none' });

    await expect(cacheService.getOrSet(key, 60, loader)).resolves.toEqual({ ok: true });
    await expect(cacheService.getOrSet(key, 60, loader)).resolves.toEqual({ ok: true });

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
