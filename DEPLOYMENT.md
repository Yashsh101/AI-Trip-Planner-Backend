# Deployment Guide

This backend is deployment-ready as a containerized Node.js service. Prefer Cloud Run for production:
it handles long-running HTTP/SSE requests better than Firebase Functions and works cleanly with the
existing Dockerfile, health checks, and local FAISS assets.

Sources checked April 30, 2026:
- Cloud Run container services: https://cloud.google.com/run/docs/configuring/services/containers
- Cloud Run environment variables: https://cloud.google.com/run/docs/configuring/services/overview-environment-variables
- Render web services: https://render.com/docs/web-services
- Render deploy commands: https://render.com/docs/deploys
- Railway start command: https://docs.railway.com/guides/start-command
- Railway variables: https://docs.railway.com/variables
- Firebase Functions TypeScript: https://firebase.google.com/docs/functions/typescript

## Deployment Readiness Audit

| Area | Status |
| --- | --- |
| Env vars | Typed Zod validation fails fast on missing production secrets. Use `.env.production.example` as the source of truth. |
| Build/start | `npm run build` compiles TypeScript; `npm start` runs `dist/src/server.js`. `npm run deploy:check` runs the full predeploy gate plus RAG index build. |
| Docker | Multi-stage Dockerfile builds the FAISS index and production JS, then installs production dependencies only. |
| Cloud Run | Compatible. App reads `PORT`; Cloud Run injects `PORT`. The service exposes HTTP endpoints and SSE over one port. |
| Firebase/GCP | Firestore uses Firebase Admin service account env vars. Cloud Run is preferred. |
| Health/readiness | `/api/v1/health`, `/api/v1/health/ready`, and `/api/v1/health/metrics` are available. |
| CORS/security | Helmet is enabled; CORS is restricted to `CORS_ORIGIN`; rate limits are env-configurable. |
| Logging | Structured Pino logs include request IDs, API latency metrics, provider metrics, and error events. |

## Required Production Variables

Set all variables from `.env.production.example` in the hosting provider. At minimum:

- `NODE_ENV=production`
- `CORS_ORIGIN`
- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `OPENWEATHER_API_KEY`
- `GOOGLE_MAPS_API_KEY`

Keep `CACHE_BACKEND=memory` unless you wire a real Redis client behind the Redis-ready cache shape.

## Google Cloud Run Preferred Deploy

1. Install and authenticate the Google Cloud CLI.
2. Select the project:

```bash
gcloud config set project YOUR_PROJECT_ID
```

3. Build and push with Cloud Build:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/ai-trip-planner-backend
```

4. Deploy to Cloud Run:

```bash
gcloud run deploy ai-trip-planner-backend \
  --image gcr.io/YOUR_PROJECT_ID/ai-trip-planner-backend \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars NODE_ENV=production,CACHE_BACKEND=memory,CORS_ORIGIN=https://your-frontend.example.com
```

5. Add secrets through Cloud Run environment variables or Secret Manager references:

```bash
gcloud run services update ai-trip-planner-backend \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=...,FIREBASE_PROJECT_ID=...,FIREBASE_CLIENT_EMAIL=...,FIREBASE_PRIVATE_KEY=...,OPENWEATHER_API_KEY=...,GOOGLE_MAPS_API_KEY=...
```

Cloud Run note: the app uses `process.env.PORT`, which matches Cloud Run's container contract.

## Render Quick Deploy

Render can deploy either from Dockerfile or Node build/start commands.

Docker path:
- Service type: Web Service
- Runtime: Docker
- Dockerfile: `Dockerfile`
- Health check path: `/api/v1/health`
- Add production env vars from `.env.production.example`

Node path:
- Build command: `npm ci && npm run build:index && npm run build`
- Start command: `npm start`
- Health check path: `/api/v1/health`
- Add production env vars from `.env.production.example`

Render note: web services must bind to the provider-assigned port; this app reads `PORT`.

## Railway Quick Deploy

Docker path:
- Create a service from the GitHub repo.
- Railway will use the Dockerfile by default.
- Set variables from `.env.production.example`.
- Keep the Dockerfile `CMD`; no custom start command is needed.

Node/Nixpacks path:
- Build command: `npm ci && npm run build:index && npm run build`
- Start command: `npm start`
- Set variables from `.env.production.example`.

Railway note: variables are configured in the service Variables tab; applying changes triggers a redeploy.

## Firebase Functions Compatibility

Firebase Functions is technically possible by wrapping `createApp()` in an HTTPS function, but it is
not the recommended target for this repo.

Reasons:
- SSE and long Gemini generations fit Cloud Run's container model better.
- Local FAISS index files and transformer/faiss dependencies increase cold start and package complexity.
- In-memory async jobs are instance-local; Cloud Run makes that tradeoff explicit.

If Firebase Functions is required later, create a separate `functions/` package that imports a small
Express adapter from this repo, disables in-memory async job assumptions, and moves background work
to a durable queue.

## Post-Deploy Smoke Test Checklist

Replace `$BASE_URL` with the deployed URL.

```bash
curl -i "$BASE_URL/api/v1/health"
curl -i "$BASE_URL/api/v1/health/ready"
curl -i "$BASE_URL/api/v1/health/metrics"
```

Async generation:

```bash
curl -sS -X POST "$BASE_URL/api/v1/itinerary/generate-async" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-001" \
  -d '{"destination":"Tokyo, Japan","duration":1,"budget":"mid","interests":["food"],"travelStyle":"solo"}'
```

Then poll the returned `statusUrl`.

SSE generation:

```bash
curl -N -X POST "$BASE_URL/api/v1/itinerary/generate" \
  -H "Content-Type: application/json" \
  -d '{"destination":"Tokyo, Japan","duration":1,"budget":"mid","interests":["food"],"travelStyle":"solo"}'
```

Optional light load smoke:

```bash
LOAD_BASE_URL="$BASE_URL" LOAD_REQUESTS=25 LOAD_CONCURRENCY=5 npm run load:smoke
```

## Rollback Notes

- Cloud Run: roll back to the previous revision from the Cloud Run console or `gcloud run services update-traffic`.
- Render/Railway: redeploy the previous successful commit.
- Keep env var changes versioned in provider change history; never commit secrets.
