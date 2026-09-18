# App Sync Contract v0.1

Dependency: Core v0.1.

App Sync provides authenticated user workspace synchronization, backup history and multi-device behavior. It is intentionally independent of Spatial.

A dedicated MultiGIS backend may implement Core + App Sync without implementing any GIS contract.

## Authority

For one workspace, exactly one Account Provider is authoritative in v0.1.

The server owns the committed workspace state. Devices maintain local replicas and durable outbound operations.

Multiple simultaneous authoritative Account Providers for one workspace are out of scope for v0.1.

## Workspace

Conceptual endpoint:

```http
GET /app-sync/v1/workspace
```

A workspace descriptor contains:

- `workspaceId`
- application identifier
- application schema version
- opaque workspace revision
- storage/blob limits
- history/retention capabilities

The server MUST NOT need to understand application-specific payload semantics.

## Workspace objects

Each object has:

- stable `objectId`
- application-defined `type`
- `schemaVersion`
- `scope`
- opaque `revision`
- `originDeviceId`
- application payload

Scopes:

### account

Replicated to the user's other devices.

Examples:

- imported GeoJSON/layers,
- favourites,
- styles,
- connection definitions,
- saved map views,
- offline-area definitions,
- provider-operation backups.

### device

Backed up by the server but not applied as active state on another device.

Examples:

- actual offline-package materialization state,
- device-specific settings,
- device storage metadata.

Purely local/reconstructable data such as HTTP, render or transient tile caches are not uploaded at all.

## Initial synchronization

A new device MUST start from a consistent workspace snapshot.

Conceptual flow:

```http
POST /app-sync/v1/snapshots
GET  /app-sync/v1/snapshots/{snapshotId}/objects
```

The snapshot returns a `changeCursor` representing the same logical state.

After the snapshot is durably installed locally, incremental synchronization uses that cursor.

## Incremental changes

Conceptual endpoint:

```http
GET /app-sync/v1/changes?cursor=<opaque>
```

The response contains changes and a new opaque cursor.

The client MUST persist the next cursor only after all associated changes are durably committed locally.

Delivery may be at-least-once. Clients MUST tolerate seeing the same object revision again.

If the cursor is no longer valid, the server returns `CURSOR_EXPIRED` and the client obtains a new full snapshot.

## Writes and idempotency

Writes are expressed as operations with a client-generated stable `operationId`.

Each update/delete includes the object's `baseRevision`.

Retries use the same operationId.

The provider MUST return the same logical result for a retry of the same operation and MUST reject reuse of the same operationId with different logical content.

## Multi-device conflict handling

Conflict detection is object-level.

Example:

```text
PC      Server      Tablet
 | rev7   |           | rev7
 | edit ->| rev8      |
 |        |<- edit    |
 |        | base rev7 |
              |
           conflict
```

The server MUST NOT silently use last-writer-wins as the default for conflicting updates.

Conflict response includes the current revision and enough current state for the application to present or implement an explicit resolution.

Changes to different objects do not conflict merely because the workspace global revision changed.

## Deletes and tombstones

Delete creates a new object revision represented as a tombstone in the change stream.

Tombstones MUST live at least as long as any valid change cursor can depend on them.

Backup-capable providers retain deletion history according to their published retention policy.

Restore never rewinds the technical revision history. Restoring an older state creates a new current revision.

## Blobs

Large/imported content is content-addressed by SHA-256.

Conceptual endpoints:

```http
HEAD /app-sync/v1/blobs/{sha256}
PUT  /app-sync/v1/blobs/{sha256}
GET  /app-sync/v1/blobs/{sha256}
```

Typical flow:

1. client hashes content,
2. HEAD checks whether it already exists,
3. PUT uploads missing content,
4. server independently verifies SHA-256,
5. workspace operation commits the object referencing the blob.

An object requiring a missing blob MUST NOT be committed and returns `BLOB_MISSING`.

This supports deduplication of identical imports across devices.

## GeoJSON imports

An imported GeoJSON document is application workspace data.

It may be represented by metadata plus a blob reference. App Sync treats the contents as application payload and does not become a Spatial Provider merely because the blob contains geodata.

Publishing such data as a general Spatial Source is a separate explicit operation outside App Sync.

## Provider operations

A pending operation against a Spatial Provider may be stored as an account-scoped workspace object.

This protects pending work against device loss and permits another authorized device to execute it.

The Account Provider MUST NOT execute such operations merely because it stores them.

Another device may execute the operation only if it independently has an authorized route to the target source and MUST reuse the original spatial `operationId`.

## Devices

An installation has a stable `deviceId`.

Account Provider stores device metadata such as:

- name,
- application,
- platform,
- version,
- authorization state,
- last seen,
- last sync.

A device may be revoked without disabling the entire user account.

## Backup semantics

Automatic server synchronization becomes a backup feature only when the provider also advertises history/restore support.

A backup-capable provider publishes its retention policy.

It retains enough history and tombstones to restore supported previous states.

Restore writes a new current state/revision rather than rolling revision history backwards.

## Reconnect order

Recommended MultiGIS reconnect sequence:

1. restore network,
2. Core discovery/auth refresh,
3. establish App Sync,
4. receive workspace changes (including provider operations created on another device),
5. rediscover Spatial routes,
6. submit eligible provider outbox operations,
7. refresh Spatial source revisions/snapshots.

This ordering lets multi-device pending work become visible before provider synchronization runs.

## v0.1 exclusions

- multiple authoritative Account Providers for one workspace,
- automatic conflict merge,
- distributed execution locks,
- server execution of Spatial provider operations,
- tile-byte replication,
- application-specific GIS semantics inside the Account Provider.
