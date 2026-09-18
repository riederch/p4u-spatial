# App Sync HTTP v0.1

Dependency: Core v0.1.

This document fixes the initial HTTP surface for the App Sync contract.

## Workspace

```http
GET /app-sync/v1/workspace
```

Returns the authoritative workspace descriptor for the authenticated principal and application.

## Initial snapshot

```http
POST /app-sync/v1/snapshots
GET  /app-sync/v1/snapshots/{snapshotId}/objects
```

A snapshot is immutable for its lifetime and returns a `changeCursor` representing the same logical workspace state.

A new device MUST install the complete snapshot durably before accepting that cursor as its local synchronization position.

## Incremental changes

```http
GET /app-sync/v1/changes?cursor=<opaque>
```

The server returns a page of changes, `nextCursor` and `hasMore`.

The client MUST persist `nextCursor` only after every change in the page is durably applied.

If a cursor cannot be served anymore:

```text
409 CURSOR_EXPIRED
```

The client obtains a new initial snapshot.

## Operations

```http
POST /app-sync/v1/operations
GET  /app-sync/v1/operations/{operationId}
```

Actions:

- `create`
- `update`
- `delete`

The client generates `operationId` before the first attempt and reuses it for all retries.

For update/delete, `baseRevision` is required.

Conflicting writes return an operation status with `state = conflict`; the server MUST NOT silently apply last-writer-wins.

## Blobs

```http
HEAD /app-sync/v1/blobs/{sha256}
PUT  /app-sync/v1/blobs/{sha256}
GET  /app-sync/v1/blobs/{sha256}
```

The server verifies SHA-256 independently.

A workspace operation referencing a required missing blob returns `BLOB_MISSING`.

## Devices

```http
GET    /app-sync/v1/devices
GET    /app-sync/v1/devices/{deviceId}
PATCH  /app-sync/v1/devices/{deviceId}
DELETE /app-sync/v1/devices/{deviceId}
```

DELETE means revoke authorization, not delete the user account.

## History and restore

Backup-capable providers additionally expose:

```http
GET  /app-sync/v1/history
POST /app-sync/v1/restore
```

A history entry identifies a restorable logical workspace state.

Restore MUST create a new current workspace revision. It MUST NOT move the technical revision sequence backwards.

The restore request has its own stable `operationId` and is idempotent.

## Relevant errors

- `CURSOR_EXPIRED`
- `REVISION_CONFLICT`
- `OPERATION_ALREADY_EXISTS`
- `OPERATION_INVALID`
- `BLOB_MISSING`
- `HASH_MISMATCH`
- `HISTORY_POINT_NOT_FOUND`
