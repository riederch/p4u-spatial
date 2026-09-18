# Protocol Conformance

Conformance is split by independent contract/profile rather than one all-or-nothing suite.

The machine-readable suite index is [suites.json](suites.json).

Initial suites include:

- CORE
- SPATIAL-READ
- SPATIAL-WRITE
- ARTIFACTS
- RELATIONS
- TILES-READ
- TILES-OFFLINE
- APP-SYNC
- APP-SYNC-BACKUP
- FEDERATION
- XR
- GIT-REPOSITORY
- PUBLISH

## Core examples

- discovery validates against the schema,
- `protocolId` is `open-spatial-interop`,
- instanceId remains stable across restart,
- protected endpoint without credentials fails,
- unknown optional fields/capabilities do not break old clients,
- `/core/v1/me` returns canonical scope names.

Reference fixtures live in `conformance/fixtures/`.

The P4U Bridge is the first executable Core/XR reference implementation. Its Vitest suite exercises discovery, stable instance identity, pairing, Core principal resolution and durable XR scan commit.

## Spatial Read examples

- sourceId remains stable,
- federation preserves sourceId,
- different principals/access views cannot share an unsafe cache,
- permission change changes viewRevision,
- snapshot remains internally consistent while live data changes,
- partial snapshot never replaces the last verified cache,
- stale federation cache is explicitly marked.

## App Sync examples

- a new device obtains a full snapshot plus matching change cursor,
- change delivery may be repeated without corrupting local state,
- expired cursor requires a fresh snapshot,
- conflicting object revisions are not silently overwritten,
- tombstones propagate deletes,
- missing required blobs block object commit,
- restore creates a new current revision,
- provider outbox survives loss of the originating device.

## Schema checks

```bash
npm run check:schemas
```

parses every JSON Schema under `protocol/schemas/` and verifies that local file references resolve.

Full semantic JSON Schema validation will be added when the conformance runner grows beyond the first reference implementation.
