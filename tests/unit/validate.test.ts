import { describe, expect, it } from 'vitest';
import { TripSchema } from '../../src/routes/itinerary.route';

const valid = {
  destination: 'Tokyo, Japan',
  duration: 5,
  budget: 'mid',
  interests: ['food'],
  travelStyle: 'solo',
} as const;

describe('TripSchema', () => {
  it('passes valid input', () => expect(TripSchema.safeParse(valid).success).toBe(true));
  it('rejects duration > 14', () => expect(TripSchema.safeParse({ ...valid, duration: 15 }).success).toBe(false));
  it('rejects empty interests', () => expect(TripSchema.safeParse({ ...valid, interests: [] }).success).toBe(false));
  it('rejects invalid budget', () => expect(TripSchema.safeParse({ ...valid, budget: 'ultra' }).success).toBe(false));
  it('rejects short destination', () => expect(TripSchema.safeParse({ ...valid, destination: 'x' }).success).toBe(false));
});
