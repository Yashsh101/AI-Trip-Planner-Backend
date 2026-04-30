import { describe, expect, it } from 'vitest';
import { itineraryEvaluatorService } from '../../src/services/itinerary-evaluator.service';
import type { Itinerary, TripRequest } from '../../src/types';

const request: TripRequest = {
  destination: 'Tokyo, Japan',
  duration: 1,
  budget: 'mid',
  interests: ['food', 'history'],
  travelStyle: 'solo',
};

const itinerary: Itinerary = {
  tripId: 'trip-1',
  destination: 'Tokyo, Japan',
  duration: 1,
  budget: 'mid',
  travelStyle: 'solo',
  days: [
    {
      day: 1,
      title: 'Day 1: Food and History',
      theme: 'Central Tokyo food and history loop',
      morning: [
        {
          name: 'Historic market walk',
          description: 'Explore a historic market area with time for local snacks and practical orientation.',
          duration: '2 hours',
          location: 'Central Tokyo',
          coordinates: { lat: 35.665, lng: 139.77 },
          type: 'attraction',
          estimatedCostUSD: 20,
          ragSource: 'ATTRACTIONS',
        },
        {
          name: 'Museum cafe lunch',
          description: 'Use an indoor museum cafe stop to balance pace while still sampling local food.',
          duration: '90 minutes',
          location: 'Central Tokyo',
          coordinates: { lat: 35.667, lng: 139.771 },
          type: 'food',
          estimatedCostUSD: 35,
          ragSource: 'FOOD',
        },
      ],
      afternoon: [
        {
          name: 'History museum visit',
          description: 'Visit a history-focused museum with exhibits that explain the city context.',
          duration: '2 hours',
          location: 'Central Tokyo',
          coordinates: { lat: 35.668, lng: 139.772 },
          type: 'activity',
          estimatedCostUSD: 25,
          ragSource: 'CULTURE',
        },
        {
          name: 'Neighborhood transit hop',
          description: 'Take a short train ride to keep the route efficient and avoid backtracking.',
          duration: '30 minutes',
          location: 'Central Tokyo',
          coordinates: { lat: 35.669, lng: 139.773 },
          type: 'transport',
          estimatedCostUSD: 5,
          ragSource: 'TRANSPORT',
        },
      ],
      evening: [
        {
          name: 'Izakaya food crawl',
          description: 'End with a compact food crawl that matches the requested food interest.',
          duration: '2 hours',
          location: 'Central Tokyo',
          coordinates: { lat: 35.67, lng: 139.774 },
          type: 'food',
          estimatedCostUSD: 60,
          ragSource: 'FOOD',
        },
      ],
      dailyCostUSD: 145,
      weatherNote: 'Rain possible, with indoor museum alternatives included.',
    },
  ],
  totalEstimatedCostUSD: 145,
  travelTips: ['Use transit cards for easy local travel.', 'Book popular dining windows ahead.', 'Carry cash for small vendors.', 'Start early for quieter museums.'],
  bestTimeToVisit: 'Spring and autumn usually offer comfortable sightseeing conditions.',
  generatedAt: '2026-04-30T00:00:00.000Z',
  meta: {
    modelVersion: 'gemini-1.5-flash',
    promptVersion: 'v2_rag_grounded',
    ragChunksUsed: 4,
    weatherDataUsed: true,
    fromCache: false,
    generationMs: 1000,
  },
};

describe('itineraryEvaluatorService', () => {
  it('scores a coherent itinerary with measurable dimensions', async () => {
    const score = await itineraryEvaluatorService.evaluate(itinerary, request);

    expect(score.feasibilityScore).toBeGreaterThanOrEqual(85);
    expect(score.routeEfficiencyScore).toBeGreaterThanOrEqual(85);
    expect(score.weatherRiskScore).toBeGreaterThanOrEqual(90);
    expect(score.budgetFitScore).toBe(100);
    expect(score.preferenceMatchScore).toBe(100);
    expect(score.overallQualityScore).toBeGreaterThanOrEqual(90);
    expect(score.signals.length).toBeGreaterThan(0);
  });
});
