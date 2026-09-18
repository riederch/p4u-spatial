# Protocol Conformance

Conformance is split by independent contract/profile rather than one all-or-nothing suite.

Initial suites:

- CORE
- SPATIAL-READ
- TILES-READ
- TILES-OFFLINE
- APP-SYNC
- APP-SYNC-BACKUP
- FEDERATION
- XR

## Core examples

- discovery validates against the schema,
- instanceId remains stable across restart,
- protected endpoint without credentials fails,
- unknown optional fields/capabilities do not break old clients.

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

Executable test tooling will be added after the schemas and mock implementations stabilize.
