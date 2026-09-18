# ADR 0011: Source-wide Spatial Operation Idempotency

Status: accepted

## Decision

Spatial write idempotency is identified by:

```text
(sourceId, operationId)
```

and is independent of route.

Clients generate a stable operationId before first transmission and preserve it across retries, route failover and multi-device execution.

An authoritative adapter without native operation identifiers maintains an idempotency ledger.

## Consequences

The same offline operation can arrive directly and through a federation relay without creating duplicate mutations.

A lost success response followed by retry is safe.

Reusing the same identity with different logical content is an explicit conflict/error rather than a second operation.

Providers publish operation-result retention so clients know the guaranteed idempotency window.
