# Spatial Write Contract v0.1

Dependency: Core v0.1 and Spatial Read v0.1.

Spatial Write defines retry-safe mutations against an authoritative Spatial Source. It is designed for local-first clients, intermittent connectivity and federation.

## Endpoint

```http
POST /spatial/v1/operations
GET  /spatial/v1/operations/{operationId}
```

The endpoint belongs to the current route/instance. The operation target always identifies the authoritative source.

## Operation identity

The client generates `operationId` before the first transmission.

Idempotency is scoped by:

```text
(sourceId, operationId)
```

It is not scoped by route.

This permits the same logical operation to be retried through a different route without creating a duplicate authoritative change.

An adapter whose native backend has no operation identifier MUST maintain an idempotency ledger.

## Actions

v0.1 defines:

- `create`
- `update`
- `delete`

The target contains:

- `sourceId`
- `collectionId`
- optional `objectId` for create
- required `objectId` for update/delete

A client MAY preassign an object ID on create when supported by the collection/provider. Otherwise the committed result returns the authoritative object ID.

## Payload

Create and update include a payload.

Where the target collection is represented by OGC API Features/GeoJSON, the payload SHOULD be a GeoJSON Feature or the provider's explicitly documented compatible representation.

The open contract does not require providers to adopt the payload as their internal storage model.

## Optimistic concurrency

Update and delete MUST include `baseRevision`.

The revision is opaque.

If the current authoritative object revision no longer matches the supplied base revision, the operation enters terminal state `conflict`.

The provider MUST NOT silently apply last-writer-wins.

Create normally has `baseRevision = null`.

## States

v0.1 operation states are:

- `accepted`
- `relay-durable`
- `source-committed`
- `conflict`
- `rejected`

Terminal states:

- `source-committed`
- `conflict`
- `rejected`

`accepted` means the receiving instance accepted the request but has not yet made a stronger durability/authority guarantee.

`relay-durable` means an explicitly durable federation relay persisted the operation and assumed responsibility for upstream retry.

`source-committed` means the authoritative source durably committed the logical operation.

## Direct provider

Typical direct flow:

```text
local-queued
    |
    v
 accepted
    |
    v
source-committed
```

A provider MAY return `source-committed` immediately when processing is synchronous.

## Federated flow

Typical durable relay flow:

```text
local-queued
    |
    v
 accepted
    |
    v
relay-durable
    |
    +------> conflict
    |
    +------> rejected
    |
    v
source-committed
```

`relay-durable` MUST NOT be interpreted as an authoritative commit.

## Retry

A retry of the same logical request MUST reuse the same `operationId`.

The authoritative source MUST return the same logical result for repeated delivery of an already known operation.

Reuse of the same `(sourceId, operationId)` with different logical request content MUST be rejected with `OPERATION_ID_CONFLICT`.

Network loss after an authoritative commit therefore does not create a duplicate mutation when the client retries.

## Operation retention

A write-capable route/source publishes `operationRetentionSeconds`.

The provider MUST retain enough operation result/idempotency information for at least that interval.

Clients MUST retain terminal operation state locally and MUST NOT retry operations already known to be terminal.

## Authorization

A write is allowed only when the current route supports the requested write capability and the authenticated principal/resource permissions permit it.

A client MUST NOT infer write permission through a federation route merely because a different direct route to the same source is writable.

Example:

```text
WWG direct route: read + update
WWG via HA service route: read only
```

The HA route remains read-only.

## Conflict

A conflict response identifies the conflict type and current authoritative revision. Where allowed, it SHOULD include the current object representation so the client can present an explicit resolution workflow.

v0.1 does not define automatic merging.

## Client outbox

Before first transmission, an offline-capable client MUST durably persist the complete operation.

The local outbox survives application restart and network loss.

The client may remove its only full local payload after:

- `source-committed`, or
- `relay-durable` when the relay explicitly advertises durable-relay capability and local trust policy permits handoff.

A client retaining an additional copy until `source-committed` is always permitted.

## Relevant errors

- `REVISION_CONFLICT`
- `OPERATION_ID_CONFLICT`
- `OPERATION_INVALID`
- `SOURCE_NOT_FOUND`
- `OBJECT_NOT_FOUND`
- `ACCESS_DENIED`
- `SCOPE_REQUIRED`
- `CAPABILITY_REQUIRED`
- `UPSTREAM_UNAVAILABLE`
