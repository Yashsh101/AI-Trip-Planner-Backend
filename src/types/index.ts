export interface TripRequest {
  destination: string;
  duration: number;
  budget: 'budget' | 'mid' | 'luxury';
  interests: string[];
  travelStyle: 'solo' | 'couple' | 'family' | 'group';
  startDate?: string;
}

export interface Activity {
  name: string;
  description: string;
  duration: string;
  location: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  type: 'attraction' | 'food' | 'transport' | 'accommodation' | 'activity';
  estimatedCostUSD: number;
  ragSource: string | null;
}

export interface DayPlan {
  day: number;
  title: string;
  theme: string;
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
  dailyCostUSD: number;
  weatherNote: string | null;
}

export interface Itinerary {
  tripId: string;
  destination: string;
  duration: number;
  budget: string;
  travelStyle: string;
  days: DayPlan[];
  totalEstimatedCostUSD: number;
  travelTips: string[];
  bestTimeToVisit: string;
  generatedAt: string;
  meta: ItineraryMeta;
}

export interface ItineraryMeta {
  modelVersion: string;
  promptVersion: string;
  ragChunksUsed: number;
  weatherDataUsed: boolean;
  fromCache: boolean;
  generationMs: number;
}

export interface ItineraryQualityScore {
  feasibilityScore: number;
  routeEfficiencyScore: number;
  weatherRiskScore: number;
  budgetFitScore: number;
  preferenceMatchScore: number;
  overallQualityScore: number;
  signals: string[];
}

export interface KnowledgeChunk {
  id: string;
  destination: string;
  category: 'attractions' | 'food' | 'transport' | 'culture' | 'practical' | 'accommodation';
  content: string;
}

export interface DayWeather {
  date: string;
  condition: string;
  tempHighC: number;
  tempLowC: number;
  precipitationMm: number;
  icon: string;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'GEMINI_ERROR'
  | 'GEMINI_JSON_PARSE_ERROR'
  | 'RAG_UNAVAILABLE'
  | 'WEATHER_UNAVAILABLE'
  | 'FIRESTORE_ERROR'
  | 'REDIS_ERROR'
  | 'CIRCUIT_OPEN'
  | 'NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_BUFFER_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
