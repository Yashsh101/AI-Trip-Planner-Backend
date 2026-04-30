# 🚀 AI Trip Planner Backend

Production-grade backend for an AI-powered trip planning system.  
Designed with scalability, reliability, and real-world backend engineering practices.

---

## 🧠 Overview

This service generates personalized travel itineraries using AI, combining:
- LLM orchestration (Gemini)
- Retrieval-Augmented Generation (RAG)
- External APIs (Maps, Weather)
- Async job processing

Built to reflect **Big Tech-level backend architecture**.

---

## ⚙️ Tech Stack

- **Node.js + TypeScript**
- **Express.js**
- **Firebase (Firestore)**
- **Gemini AI (LLM)**
- **Zod (validation)**
- **Docker + CI/CD**
- **REST APIs + SSE**

---

## 🏗️ Architecture Highlights

- **AI Orchestrator Layer**
  - Prompt control, retries, fallback models  
- **Async Job Queue**
  - Non-blocking itinerary generation  
- **Caching Layer**
  - Memory-first, Redis-ready  
- **Reliability**
  - Retry, timeout, circuit breaker  
- **Observability**
  - Structured logs, metrics, request tracing  
- **API Design**
  - Versioned (`/api/v1`), idempotent, validated  

---

## 🔌 Core APIs

```http
GET  /api/v1/health
POST /api/v1/itinerary/generate-async
GET  /api/v1/itinerary/jobs/:id

🔄 Flow
Client → Submit trip request
→ Async job created
→ AI + APIs process itinerary
→ Client polls job status
→ Final itinerary returned

🚀 Local Setup
git clone <repo>
cd ai-trip-planner-backend
npm install
cp .env.example .env
npm run dev

🔐 Environment Variables
GEMINI_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
OPENWEATHER_API_KEY=
GOOGLE_MAPS_API_KEY=

🧪 Testing
npm run test
npm run build

🐳 Docker
docker-compose up --build

📈 Production Features
Rate limiting + caching
Idempotent requests
Fault-tolerant AI pipeline
Health + readiness endpoints
CI/CD ready

🎯 Why This Project Stands Out
Simulates real-world backend systems
Demonstrates system design thinking
Focus on reliability over hype
Built for scalable AI workloads

📌 Future Improvements
Redis-backed queue + cache
Load testing & performance metrics
Multi-region deployment

👨‍💻 Author
Built as a production-grade backend system for AI and distributed systems.  
If you find this project valuable, consider giving it a ⭐ to support the work.
