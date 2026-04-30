process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-gemini-key-12345';
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ?? 'test@example.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY =
  process.env.FIREBASE_PRIVATE_KEY ??
  '-----BEGIN PRIVATE KEY-----\\n' +
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCfakefakefakefakefakefakefakefakefakefakefakefakefakefakefakefakefakefake\\n' +
    '-----END PRIVATE KEY-----\\n';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.CACHE_BACKEND = process.env.CACHE_BACKEND ?? 'memory';
process.env.OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY ?? 'test-weather-key-12345';
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? 'test-maps-key-12345';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
