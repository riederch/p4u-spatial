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
