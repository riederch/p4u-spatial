# ADR 0026: Derived Candidate Review and Explicit Spatial Promotion

Status: Accepted

Date: 2026-09-21

## Historical note

No original ADR for the derived-candidate review/promotion boundary remains available. This ADR
reconstructs and establishes the intended architecture from the current XR contract and
implementation.

## Context

XR capture can produce deterministic or AI-assisted semantic interpretations such as rooms, walls,
doors, assets or landmarks. These interpretations may be useful, but raw capture evidence and a
derived interpretation are not automatically authoritative Spatial data.

A promotion boundary is required so confidence scores or derivation algorithms cannot silently
create or overwrite canonical source data.

## Decision

Derived XR interpretations are non-canonical candidates until explicitly reviewed and promoted.

### Candidate identity and provenance

A candidate retains:

- source scan ID,
- derivation profile,
- candidate kind,
- confidence,
- immutable evidence references,
- proposed semantic payload.

Candidate identity is local/derived identity and MUST NOT become a canonical Spatial object ID by
implication.

Deterministic derivations SHOULD produce stable candidate identity from scan/profile/evidence/kind
so reruns can reconcile the same logical candidate.

### Review

The reference workflow requires an explicit terminal review decision:

- accepted,
- rejected,
- edited.

Confidence is advisory only and does not bypass review.

Accepted/edited review selects the authoritative source/collection and, for an update, the existing
canonical object plus its base revision.

### Promotion

Review itself does not mutate Spatial authority.

Promotion is a separate explicit action that produces/executes a normal Spatial Write operation.

The reference Bridge uses a two-step administrator promotion flow:

1. generate the exact promotion preview and confirmation token,
2. execute promotion only when the unchanged token is supplied.

The promotion operation ID is deterministic for the candidate, so retrying the same confirmed
promotion uses normal source-wide Spatial idempotency.

Canonical promoted payload retains XR evidence/reviewer provenance.

A read-only source cannot be bypassed by candidate promotion. In particular, the default RCHKB
profile remains read-only and accepted evidence follows the normal RCHKB source-of-truth workflow.

## Consequences

- AI or deterministic recognition cannot silently become canonical source data.
- Human/admin review is a separate authority boundary from derivation.
- Promotion inherits normal Spatial scope, write-policy, revision/conflict and idempotency rules.
- Evidence and review provenance survive into canonical promoted data.
- RCHKB/source write restrictions remain authoritative even for accepted candidates.

## Implementation anchors

- `protocol/xr/derived-candidates.md` — candidate/review/promotion contract.
- `bridge/src/services/candidate-review-service.ts` — durable candidate state, terminal review, promotion preview/token and provenance-preserving promotion.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/CandidateDerivation.kt` — deterministic candidate identity and operation-draft helpers.
- `bridge/src/services/spatial-write-service.ts` — normal authoritative write/idempotency/conflict machinery used by promotion.

## Related decisions

- ADR 0004: AI Is Optional; Deterministic Core Is Mandatory
- ADR 0011: Source-wide Spatial Operation Idempotency
- ADR 0013: XR Is a Profile over Core
