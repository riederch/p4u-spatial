# ADR 0009: Durable Relay Acknowledgement

Status: accepted

## Decision

Federated write delivery distinguishes two acknowledgement levels:

- `relay-durable`: a trusted relay has durably persisted the operation and assumes responsibility for retry,
- `source-committed`: the authoritative source has durably accepted the operation.

These states are not equivalent.

## Consequences

An XR or other constrained client may safely hand an operation to an explicitly durable relay while the upstream source is unavailable.

The relay must retain the operation until source commit, conflict or rejection.

This ADR defines semantics only; Spatial Write/Federation endpoints are specified separately.

## Implementation anchors

- `protocol/spatial/write.md` — relay-durable and source-committed are distinct operation states.
- `protocol/federation/http.md` — federation may return relay-durable only as a durable relay.
- `bridge/src/services/federation-service.ts` — persists relay entries, retries upstream delivery and distinguishes terminal source states.

## Reconciliation note

The reference FederationService implements durable relay persistence/retry for Spatial operations. Artifact-dependent durable relay constraints from ADR 0016 remain unimplemented because Spatial Artifacts are not yet implemented by the Bridge.
