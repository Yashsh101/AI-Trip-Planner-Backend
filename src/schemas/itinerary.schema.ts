import { z } from 'zod';

export const TripSchema = z.object({
  destination: z.string().trim().min(2).max(100),
  duration: z.number().int().min(1).max(14),
  budget: z.enum(['budget', 'mid', 'luxury']),
  interests: z.array(z.string().trim().min(2).max(40)).min(1).max(5),
  travelStyle: z.enum(['solo', 'couple', 'family', 'group']),
  startDate: z.string().datetime().optional(),
});

export const ActivitySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(20).max(800),
  duration: z.string().min(3).max(40),
  location: z.string().min(2).max(160),
  type: z.enum(['attraction', 'food', 'transport', 'accommodation', 'activity']),
  estimatedCostUSD: z.number().nonnegative().max(100000),
  ragSource: z.string().min(2).max(40).nullable(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});

export const DayPlanSchema = z.object({
  day: z.number().int().min(1).max(14),
  title: z.string().min(3).max(160),
  theme: z.string().min(3).max(160),
  morning: z.array(ActivitySchema).min(1).max(4),
  afternoon: z.array(ActivitySchema).min(1).max(4),
  evening: z.array(ActivitySchema).min(1).max(4),
  dailyCostUSD: z.number().nonnegative().max(100000),
  weatherNote: z.string().min(3).max(240).nullable(),
});

export const GeminiItinerarySchema = z.object({
  days: z.array(DayPlanSchema).min(1).max(14),
  totalEstimatedCostUSD: z.number().nonnegative().max(1000000),
  travelTips: z.array(z.string().min(10).max(300)).min(4).max(8),
  bestTimeToVisit: z.string().min(10).max(500),
});

export const ItinerarySchema = GeminiItinerarySchema.extend({
  tripId: z.string().min(1),
  destination: z.string().min(2).max(100),
  duration: z.number().int().min(1).max(14),
  budget: z.string().min(3).max(20),
  travelStyle: z.string().min(3).max(20),
  generatedAt: z.string().datetime(),
  meta: z.object({
    modelVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    ragChunksUsed: z.number().int().min(0),
    weatherDataUsed: z.boolean(),
    fromCache: z.boolean(),
    generationMs: z.number().nonnegative(),
  }),
});

export const ItineraryEvaluationSchema = z.object({
  itinerary: ItinerarySchema,
  request: TripSchema.optional(),
});

export type ValidTripRequest = z.infer<typeof TripSchema>;
export type GeminiItineraryPayload = z.infer<typeof GeminiItinerarySchema>;
export type ItineraryEvaluationInput = z.infer<typeof ItineraryEvaluationSchema>;
