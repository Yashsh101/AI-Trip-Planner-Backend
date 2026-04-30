# Prompt Version History

## v2_rag_grounded (current - production)

**Deployed:** 2026-04-22
**Author:** Yash Sharma

### Changes from v1_hackathon
- Added `{{RAG_CONTEXT}}` injection so recommendations can be grounded in retrieved facts.
- Added `{{WEATHER_CONTEXT}}` injection so plans adapt to forecast conditions.
- Added `ragSource` to every activity for itinerary auditability.
- Tightened JSON output structure with day themes, daily costs, travel tips, and best time to visit.
- Added explicit pace guidance for solo, couple, family, and group travel.
- Configured Gemini with JSON response MIME type to reduce parse failures.

### Impact
- JSON parse failures should be materially lower because the model is constrained to JSON.
- `ragChunksUsed` makes grounding measurable in responses and logs.
- Prompt changes are versioned so future quality experiments have a baseline.

---

## v1_hackathon (archived)

**Deployed:** Google Gen AI Exchange Hackathon 2025
**Notes:** Simple free-form prompt. No RAG, no weather context, no prompt changelog, and no
schema-focused output contract. Kept only for comparison.
