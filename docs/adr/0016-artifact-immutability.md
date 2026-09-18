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
