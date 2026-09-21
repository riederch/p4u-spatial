# ADR 0004: AI is optional; deterministic core is mandatory

Status: Accepted

## Context

P4U Spatial may benefit from AI models for semantic recognition and knowledge processing, but an unavailable model, API outage or unsupported deployment must not make the spatial system unusable.

## Decision

All fundamental workflows are implemented without an AI dependency.

Deterministic functionality includes:
- capture and raw persistence,
- sync and repository operations,
- cache/outbox handling,
- schema validation,
- marker decoding,
- known landmark bindings,
- coordinate transforms,
- control-point registration,
- residual/error calculation,
- trajectory recording,
- rendering/display of structured data.

AI is an optional enrichment processor.

AI may:
- identify or classify unknown objects,
- propose relations,
- assist deduplication,
- suggest conflict resolution,
- generate user verification tasks,
- enrich descriptions.

AI output must preserve provenance and confidence. Uncertain AI output must not silently become authoritative.

## Consequence

If no model is available, P4U Spatial remains a fully functional spatial capture, registration, sync and display system. Semantic enrichment may be reduced or require manual confirmation.

## Implementation anchors

- `bridge/package.json` — the Bridge runtime has no AI/LLM dependency.
- `bridge/src/services/candidate-review-service.ts` — derived semantic candidates preserve evidence/provenance and require explicit review/promotion before canonical Spatial mutation.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/CandidateDerivation.kt` — deterministic candidate identity/provenance helpers do not depend on a model.
- `protocol/xr/derived-candidates.md` — candidate interpretation remains non-canonical until explicit review and Spatial promotion.
