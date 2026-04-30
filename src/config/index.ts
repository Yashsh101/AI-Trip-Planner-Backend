import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  GEMINI_API_KEY: z.string().min(10, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
  FIREBASE_PRIVATE_KEY: z.string().min(100, 'FIREBASE_PRIVATE_KEY is required'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CACHE_BACKEND: z.enum(['redis', 'memory']).default('memory'),
  OPENWEATHER_API_KEY: z.string().min(10, 'OPENWEATHER_API_KEY is required'),
  GOOGLE_MAPS_API_KEY: z.string().min(10, 'GOOGLE_MAPS_API_KEY is required'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().url('CORS_ORIGIN must be a URL'),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  ITINERARY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
  GEMINI_FALLBACK_MODEL: z.string().optional(),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  GEMINI_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(50).default(400),
  GEMINI_INPUT_COST_PER_1M_TOKENS: z.coerce.number().min(0).default(0),
  GEMINI_OUTPUT_COST_PER_1M_TOKENS: z.coerce.number().min(0).default(0),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(100),
  AI_MAX_PROMPT_TOKENS: z.coerce.number().int().min(100).default(20000),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().min(1000).default(30_000),
  GEMINI_STREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  UPSTREAM_CALL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const missing = Object.keys(result.error.flatten().fieldErrors).join(', ');
  console.error(`\nInvalid config. Fix these env vars: ${missing}\n`);
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
