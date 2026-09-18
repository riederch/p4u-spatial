# SPATIAL-WRITE v0.1 Conformance

A conforming implementation should be tested at minimum for the following behavior.

## SW-001 Retry after lost response

1. submit operation,
2. let authoritative commit succeed,
3. drop the response,
4. retry identical operationId.

Expected: exactly one authoritative mutation and the same logical result.

## SW-002 Cross-route retry

Submit the same `(sourceId, operationId)` through two routes.

Expected: at most one authoritative mutation.

## SW-003 Operation ID conflict

Reuse one `(sourceId, operationId)` with different logical content.

Expected: `OPERATION_ID_CONFLICT`; no second mutation.

## SW-004 Revision conflict

Submit update with stale `baseRevision`.

Expected: terminal `conflict`; object is not silently overwritten.

## SW-005 Delete conflict

Delete using stale revision.

Expected: terminal `conflict`.

## SW-006 Create server-assigned ID

Create without objectId where supported.

Expected: `source-committed` contains authoritative objectId.

## SW-007 Outbox restart

Restart client before acknowledgment.

Expected: operation remains queued with identical operationId.

## SW-008 Terminal retry suppression

Once client knows a terminal state, reconnect does not create a new logical operation.
