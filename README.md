# AI Trip Planner Backend

[![CI](https://github.com/Yashsh101/AI-Trip-Planner-Backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Yashsh101/AI-Trip-Planner-Backend/actions)
![Node 20](https://img.shields.io/badge/Node-20-green)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

Production-grade GenAI backend for a travel planner: RAG-grounded Gemini generation, SSE streaming,
schema-validated itineraries, AI quality scoring, provider resilience, caching, observability, and CI.

## 30 Second Summary

- Streams itinerary generation over Server-Sent Events so users see progress immediately.
- Grounds recommendations with a FAISS-backed local knowledge base and weather context.
- Validates every request and every model response with Zod before caching or persistence.
- Tracks request IDs, provider latency, token usage hooks, cache hits, circuit breaker state, and AI quota guardrails.
- Evaluates generated itineraries with measurable quality scores: feasibility, route efficiency, weather risk, budget fit, and preference match.
- Runs memory-first with Redis-ready cache boundaries, Docker Compose, and GitHub Actions quality gates.

## Feature List

| Area | Implementation |
| --- | --- |
| AI orchestration | Dedicated orchestration service for cache lookup, RAG/weather context, Gemini stream, validation, enrichment, persistence |
| Gemini integration | Streaming JSON generation, retry/fallback model support, token usage hooks, optional cost estimation |
| Observability | `x-request-id`, structured `pino-http` logs, SSE lifecycle logs, provider metrics endpoint |
| Caching | Cache facade with memory backend and Redis-ready interface; TTLs for itineraries, weather, places, route estimates, deterministic AI lookups |
| Background jobs | In-memory queue for async itinerary generation with job status polling and idempotency keys |
| AI quality | Objective evaluator returns feasibility, route efficiency, weather risk, budget fit, preference match, and overall quality |
| Reliability | Provider timeouts, circuit breakers, retry abstraction, graceful degraded weather/maps behavior |
| Safety | Prompt-injection checks, JSON output sanitization, strict schema validation, production-safe error details |
| DevOps | Dockerfile, Docker Compose, GitHub Actions, typed env validation, quality scripts |

## Architecture

```text
Client
  |
  | POST /api/v1/itinerary/generate
  v
Express route
  |
  v
Request ID -> rate limit -> Zod request validation -> cache lookup
  |
  | cache hit: JSON response
  | cache miss:
  v
AI Orchestrator
  |
  +--> prompt-injection guardrails
  +--> RAG retrieval from local FAISS index
  +--> cached weather lookup
  +--> Gemini streaming generation with retry/fallback/circuit breaker
  |
  v
SSE token stream -> JSON sanitization/repair -> Zod model-output validation
  |
  v
cached Google Places enrichment -> Redis/memory cache write -> Firestore persistence
  |
  v
optional /evaluate quality score
```

### System Design Notes

The route layer is transport-only: it owns HTTP/SSE behavior but not AI business logic. Provider
calls are isolated in services and protected by timeout/circuit-breaker boundaries. The cache and
job queue are memory-first with clean interfaces for future Redis-backed implementations. `/api/v1`
is the canonical API surface while legacy `/api` routes remain mounted for compatibility.

## Quick Start

```bash
cp .env.example .env
npm install
npm run build:index
npm run dev
```

Health check:

```bash
curl http://localhost:3001/api/health
```

One-command Docker run:

```bash
cp .env.example .env
npm run dev:docker
```

## API Documentation

All endpoints are available under `/api/v1`; legacy `/api` paths remain supported.

### `POST /api/v1/itinerary/generate`

Generates an itinerary. Cache hits return JSON immediately. Cache misses stream SSE events.

Request:

```json
{
  "destination": "Tokyo, Japan",
  "duration": 5,
  "budget": "mid",
  "interests": ["food", "history", "nature"],
  "travelStyle": "couple",
  "startDate": "2026-08-01T00:00:00.000Z"
}
```

SSE events:

```text
event: meta
data: {"tripId":"...","ragChunksUsed":5,"weatherDataUsed":true}

event: token
data: {"text":"{\"days\":[..."}

event: done
data: {"itinerary":{...}}

event: error
data: {"code":"GEMINI_ERROR","message":"Gemini failed to generate an itinerary"}
```

### `POST /api/v1/itinerary/generate-async`

Enqueues async itinerary generation. Send `Idempotency-Key` to safely retry the enqueue request.

```json
{
  "job": {
    "id": "uuid",
    "status": "queued",
    "createdAt": "2026-04-30T00:00:00.000Z",
    "updatedAt": "2026-04-30T00:00:00.000Z"
  },
  "statusUrl": "/api/v1/itinerary/jobs/uuid"
}
```

### `GET /api/v1/itinerary/jobs/:id`

Returns `queued`, `running`, `succeeded`, or `failed` plus the result/error when available.

### `POST /api/v1/itinerary/evaluate`

Scores an itinerary for AI quality.

```json
{
  "score": {
    "feasibilityScore": 94,
    "routeEfficiencyScore": 88,
    "weatherRiskScore": 96,
    "budgetFitScore": 100,
    "preferenceMatchScore": 92,
    "overallQualityScore": 94,
    "signals": ["Feasible daily pacing and cost accounting"]
  }
}
```

### `GET /api/v1/health`

Liveness endpoint with dependency status and cache backend.

### `GET /api/v1/health/ready`

Readiness endpoint. Returns `503` when critical dependencies are degraded.

### `GET /api/v1/health/metrics`

JSON metrics snapshot for provider calls, token usage hooks, cost guardrails, and circuit breakers.

### `GET /api/v1/trips` and `GET /api/v1/trips/:id`

Reads recent persisted Firestore trips.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `GEMINI_MODEL` | no | Primary model, defaults to `gemini-1.5-flash` |
| `GEMINI_FALLBACK_MODEL` | no | Optional failover model |
| `GEMINI_MAX_RETRIES` | no | Retry attempts before fallback |
| `GEMINI_RETRY_BASE_DELAY_MS` | no | Exponential backoff base delay |
| `GEMINI_INPUT_COST_PER_1M_TOKENS` | no | Optional current input-token pricing hook |
| `GEMINI_OUTPUT_COST_PER_1M_TOKENS` | no | Optional current output-token pricing hook |
| `AI_DAILY_REQUEST_LIMIT` | no | Basic in-process daily AI quota |
| `AI_MAX_PROMPT_TOKENS` | no | Prompt-size cost guardrail |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | no | Provider failures before circuit opens |
| `CIRCUIT_BREAKER_RESET_MS` | no | Circuit half-open reset window |
| `CACHE_BACKEND` | no | `memory` for local dev, `redis` for shared deployments |
| `REDIS_URL` | no | Reserved for future Redis-backed cache/queue wiring |
| `OPENWEATHER_API_KEY` | yes | Weather forecast provider key |
| `GOOGLE_MAPS_API_KEY` | yes | Places enrichment provider key |
| `FIREBASE_PROJECT_ID` | yes | Firestore project |
| `FIREBASE_CLIENT_EMAIL` | yes | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | yes | Firebase Admin private key with escaped newlines |
| `CORS_ORIGIN` | yes | Frontend origin |
| `PORT` | no | API port, defaults to `3001` |
| `LOG_LEVEL` | no | Pino log level |

## AI/ML Engineering

- Prompt versioning lives in `src/prompts`.
- RAG context is retrieved from `data/faiss.index` and `data/chunks.json`.
- Gemini output is required to be JSON and is schema-validated before enrichment, caching, or persistence.
- The evaluator gives a measurable quality score that can become an offline regression benchmark.
- Token/cost hooks are provider-aware but pricing values are configured through env vars to avoid hardcoding stale pricing.
- Prompt-injection checks reject user inputs that try to override system/developer instructions.

## Production Readiness

- Request traceability through `x-request-id` response headers and structured logs.
- Provider degradation is contained with timeouts, retries, fallback model support, circuit breakers, and typed errors.
- External API calls are cached with separate TTLs for correctness and cost control.
- Cache hits avoid repeated expensive AI generation.
- Async generation supports polling and idempotent enqueue retries.
- Health, readiness, and metrics endpoints support deployment checks and demos.
- Production error responses hide internal details except safe validation/rate-limit context.

## Testing

```bash
npm run type-check
npm run lint
npm test
npm run build
npm run check
npm run load:smoke
```

Current suite covers schema validation, cache key determinism, memory cache behavior, RAG degraded
mode, SSE upstream failure safety, invalid AI output handling, async job enqueue/status, health/metrics,
prompt safety, and itinerary scoring.

## CI/CD

GitHub Actions runs:

1. `npm ci`
2. `npm run type-check`
3. `npm run lint`
4. `npm test`
5. `npm run build`
6. `npm run build:index`

Docker build runs the RAG index build and TypeScript build. Compose starts Redis and the backend.

## Deployment

Use [DEPLOYMENT.md](./DEPLOYMENT.md) for Render, Railway, Google Cloud Run, Firebase Functions
compatibility notes, production env vars, and the post-deploy smoke checklist. Cloud Run is the
preferred production target for this repo because the service uses container-friendly HTTP/SSE,
local RAG assets, and instance-local async job state.

## Knowledge Base

`data/destinations.json` contains factual chunks across 10 destinations, including Tokyo, Paris,
Bali, New York City, Bangkok, Rome, Dubai, London, Singapore, and Sydney.

After editing destination facts:

```bash
npm run build:index
```

## Demo Script

1. Start the backend with `npm run dev:docker`.
2. Open `/api/health` and show cache, Firestore, and RAG status.
3. Open `/api/health/metrics` and show provider/circuit/cost guardrail telemetry.
4. Generate a trip with `POST /api/v1/itinerary/generate` and show SSE `meta`, `token`, and `done` events.
5. Repeat the same request and show the cache hit response.
6. Enqueue a trip with `POST /api/v1/itinerary/generate-async` and poll `/api/v1/itinerary/jobs/:id`.
7. Send the itinerary to `/api/v1/itinerary/evaluate` and show the quality score.
8. Briefly explain failure modes: Gemini fallback, circuit breakers, prompt-injection rejection, invalid JSON rejection.

## Resume Bullets

- Architected a production-style TypeScript/Express backend for AI trip planning with versioned APIs, SSE streaming, RAG grounding, Firebase persistence, Zod validation, and Dockerized deployment.
- Built reliability controls across AI and external providers: request IDs, structured logs, API/provider latency metrics, rate limiting, timeout handling, retry/fallback logic, circuit breakers, and safe error responses.
- Implemented memory-first cache and job abstractions with TTLs, hit/miss telemetry, idempotent async itinerary enqueueing, and job status polling while preserving Redis-ready extension points.
- Hardened the API surface with `/api/v1` routing, strict body/param validation, production-safe error envelopes, CORS/Helmet security middleware, and health/readiness/metrics endpoints.
- Delivered CI/CD and deployment readiness with GitHub Actions quality gates, multi-stage Docker builds, Cloud Run/Render/Railway deployment docs, production env templates, and post-deploy smoke tests.

## Hiring Assets

GitHub repo description:

```text
Production-grade TypeScript backend for an AI trip planner: Gemini SSE streaming, RAG grounding,
Firebase persistence, Zod validation, rate limits, cache/jobs abstractions, observability, Docker,
CI, and Cloud Run-ready deployment docs.
```

30-second recruiter pitch:

```text
I rebuilt an AI Trip Planner backend from a hackathon prototype into a production-style TypeScript
service. It has versioned Express APIs, Gemini streaming, RAG grounding, Firebase persistence,
strict Zod validation, rate limits, structured observability, async jobs, Docker, CI, and deployment
docs for Cloud Run, Render, and Railway. The project shows backend ownership: reliability,
scalability, safe API design, and production readiness.
```

2-minute technical walkthrough:

```text
The backend exposes versioned `/api/v1` routes on Express. Requests flow through request ID,
Helmet/CORS, API metrics, rate limiting, and Zod validation before hitting transport-only routes.
The AI orchestrator owns business logic: cache lookup, prompt-injection checks, RAG retrieval,
weather context, Gemini streaming, JSON sanitization, schema validation, place enrichment, caching,
and Firestore persistence.

Reliability is handled with provider timeouts, retry/fallback logic, circuit breakers, safe error
responses, and health/readiness/metrics endpoints. Cost and scale controls include memory-first
TTL caching, deterministic AI lookup caching, rate limits, and basic AI quota guardrails. For slower
flows, `/generate-async` uses an in-memory queue with idempotency keys and job status polling.

For deployment, the repo has a multi-stage Dockerfile, Docker Compose, GitHub Actions quality gates,
`.env.production.example`, and a Cloud Run-first deployment guide with Render/Railway quick deploys
and smoke tests.
```

## LinkedIn Launch Post

I rebuilt my AI Trip Planner backend from a hackathon prototype into a production-style GenAI system.

What changed:
- TypeScript/Express service architecture
- Gemini streaming over SSE
- RAG grounding with FAISS
- Zod validation for API inputs and LLM outputs
- Memory-first caching with TTLs and Redis-ready interfaces
- Request IDs and structured observability
- Provider retry, fallback, timeout, and circuit breaker controls
- Prompt-injection checks and JSON sanitization
- AI quality scoring across feasibility, routing, weather, budget, and preference fit
- Docker Compose and GitHub Actions CI

The most interesting part was treating the LLM like an unreliable distributed-system dependency:
observable, validated, cached, rate-limited, and evaluated.

Repo: https://github.com/Yashsh101/AI-Trip-Planner-Backend
=======
# ✈️ AI Trip Planner

## 🚀 Overview

AI Trip Planner is an intelligent travel assistant that generates personalized, dynamic itineraries based on user preferences, budget, and real-time conditions like weather.

Built during the Google Gen AI Exchange Hackathon, this project leverages Google's Gemini AI to create structured travel plans and adapt them dynamically.

---

## 🧠 Key Features

* 🤖 AI-powered itinerary generation (Gemini via Vertex AI)
* 🌦️ Real-time weather-based trip adjustments
* 🗺️ Google Maps integration for routes & POIs
* 💬 Chat-style travel planning experience
* 💸 Cost estimation and breakdown
* 🔄 Dynamic itinerary regeneration

---

## 🛠️ Tech Stack

### Frontend

* React
* Google Maps API
* Tailwind CSS

### Backend

* Node.js
* Express.js
* Firebase Functions
* Firestore

### AI & APIs

* Google Gemini (Vertex AI)
* Weather API

---

## 📂 Project Structure

```bash
Frontend/
Backend/
```

---

## ⚙️ How It Works

1. User enters trip details
2. Backend collects context (weather, maps)
3. Gemini generates structured itinerary
4. Frontend renders interactive trip plan
5. System updates dynamically based on changes

---

## 🔮 Future Enhancements

* Flight & hotel booking integration (Amadeus, Expedia APIs)
* Payment integration (Razorpay, Stripe)
* Voice-based planning
* AI travel recommendations using embeddings
* AR/VR previews of destinations

---

## 🏆 Built For
Google Gen AI Exchange Hackathon

## 🔗 Related Repositories

- Frontend: https://github.com/Yashsh101/AI-Trip-Planner-Frontend  
- Backend: https://github.com/Yashsh101/AI-Trip-Planner-Backend

⭐ If you like this project, give it a star!
