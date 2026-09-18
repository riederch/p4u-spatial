# FEDERATION v0.1 Conformance

## FED-001 Source identity preservation

A source exposed through federation has the same sourceId as upstream.

## FED-002 Service access rights

Upstream service credential is read-only while a user has a writable direct route.

Expected: federated route advertises/permits read only.

## FED-003 Cached provenance

Disconnect upstream after a successful cache fill.

Expected: returned data is marked cached/stale or cached/unknown, never live.

## FED-004 Durable persistence

Submit a write to a durable relay while upstream is unavailable and receive `relay-durable`.

Restart relay process.

Expected: operation still exists with the same operationId and remains pending for upstream delivery.

## FED-005 Final authority

Relay MUST NOT emit `source-committed` before authoritative upstream confirmation.

## FED-006 Conflict propagation

Upstream returns revision conflict.

Expected: relay exposes terminal `conflict` without rewriting/retrying as a different logical operation.

## FED-007 Credential isolation

No API response exposes the federation provider's upstream service credential.

## FED-008 Duplicate delivery

Relay sends an operation upstream, loses the response and retries.

Expected: source-wide idempotency produces one mutation.

## FED-009 Relay is not authority

Cached/federated data never receives a replacement sourceId owned by the relay.
