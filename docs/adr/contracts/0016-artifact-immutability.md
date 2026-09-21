# ADR 0016: Spatial Artifact Immutability

Status: accepted

## Decision

Committed Spatial Artifacts are immutable binary resources identified within an authoritative source and protected by SHA-256 integrity metadata.

Changing bytes creates a new artifact identity.

Upload sessions are retry-safe through a client-generated uploadId.

## Consequences

Offline/federated caches can verify artifact content without risk of silent byte replacement.

Spatial operations may safely retain stable Artifact References.

A durable relay may acknowledge an operation that depends on artifacts only when the required binary payload is durably available for later upstream delivery.

## Implementation anchors

- `protocol/spatial/artifacts.md` — immutable source-scoped artifacts and retry-safe upload session contract.
- `protocol/schemas/spatial/artifact-descriptor.schema.json` — committed artifact descriptor.
- `protocol/schemas/spatial/artifact-upload-request.schema.json` — client-generated uploadId and declared integrity metadata.
- `protocol/profiles/git-repository.md` — reference Git-backed artifact persistence layout.
- `bridge/src/services/spatial-artifact-service.ts` — retry-safe upload sessions, immutable commit, integrity verification and Artifact Reference readiness checks.
- `bridge/src/server.ts` — authenticated Artifact read/upload/commit HTTP endpoints and capability advertisement.
- `bridge/src/services/spatial-write-service.ts` — authoritative local writes reject uncommitted local Artifact References.
- `bridge/test/artifact.test.ts` — retry, integrity, immutability and readiness regression coverage.

## Reconciliation note

The local authoritative-source implementation is now aligned with this ADR:

- descriptor/content reads are implemented,
- upload create/status/content/commit are retry-safe,
- committed content is immutable and SHA-256/size verified,
- new local Spatial writes reject uncommitted local Artifact References,
- discovery/source capabilities expose `spatial.artifacts.read` and, for writable sources,
  `spatial.artifacts.write`.

Federation remains narrower than the full ADR consequence: artifact-aware durable relay is not yet
implemented, so a relay must not claim artifact-dependent durability until those payloads are
durably available to the relay or authoritative source.
