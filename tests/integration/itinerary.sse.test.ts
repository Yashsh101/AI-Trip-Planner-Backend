import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/app';
import { geminiService } from '../../src/services/gemini.service';
import { ragService } from '../../src/services/rag.service';
import { weatherService } from '../../src/services/weather.service';
import { mapsService } from '../../src/services/maps.service';
import { AppError } from '../../src/types';

describe('POST /api/itinerary/generate (SSE) - upstream failure safety', () => {
  const validBody = {
    destination: 'Tokyo, Japan',
    duration: 2,
    budget: 'mid',
    interests: ['food', 'history'],
    travelStyle: 'solo',
    startDate: '2026-08-01T00:00:00.000Z',
  } as const;

  beforeEach(() => {
    vi.spyOn(ragService, 'retrieve').mockResolvedValue({
      context: '[FOOD]\nSome grounded facts',
      count: 2,
    });

    vi.spyOn(weatherService, 'forecast').mockResolvedValue([
      {
        date: '2026-08-01',
        condition: 'clear sky',
        tempHighC: 30,
        tempLowC: 25,
        precipitationMm: 0,
        icon: '01d',
      },
    ]);

    vi.spyOn(mapsService, 'enrichActivity').mockImplementation(async (_destination, activity) => activity);

    vi.spyOn(geminiService, 'streamItinerary').mockImplementation(async function* () {
      if (Date.now() < 0) yield '';
      throw new AppError('Gemini failed to generate an itinerary', 502, 'GEMINI_ERROR');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured SSE error and ends the stream cleanly when Gemini stream fails', async () => {
    const res = await request(createApp())
      .post('/api/itinerary/generate')
      .set('Accept', 'text/event-stream')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const body = res.text;

    expect(body).toContain('event: meta');
    expect(body).toContain('event: error');
    expect(body).toContain('"code":"GEMINI_ERROR"');
    expect(body).toContain('"message":"Gemini failed to generate an itinerary"');

    // stream should end; supertest got a complete response body
    expect(body.length).toBeGreaterThan(0);
  });

  it('emits structured SSE error when Gemini returns invalid JSON', async () => {
    vi.mocked(geminiService.streamItinerary).mockImplementation(async function* () {
      yield 'not-json';
    });

    const res = await request(createApp())
      .post('/api/itinerary/generate')
      .set('Accept', 'text/event-stream')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('"code":"GEMINI_JSON_PARSE_ERROR"');
  });
});
