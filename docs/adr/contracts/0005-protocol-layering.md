# ADR 0005: Protocol Layering

Status: accepted

## Decision

The public interoperability contract is split into a shared Core and independent contracts for Spatial, Tiles, App Sync, Federation and XR.

Spatial and App Sync both depend on Core but MUST NOT depend on each other.

Portable backup is a local file format rather than a network contract.

## Consequences

A domain Fire instance may expose Core + Spatial only.

A dedicated MultiGIS backend may expose Core + App Sync only.

P4U Spatial may expose Core + Spatial + Federation + XR.

The protocol may later move to its own repository without changing these dependency boundaries.

## Implementation anchors

- `protocol/README.md` — contract dependency map and implementation-neutral layering.
- `protocol/core/README.md` — shared Core contract.
- `protocol/spatial/README.md` — Spatial contract independent of App Sync.
- `protocol/app-sync/README.md` — App Sync contract depending on Core, not Spatial.
- `protocol/formats/portable-backup.md` — backup is a local format rather than a network contract.

## Reconciliation note

The layering is fully represented in the protocol tree. The P4U reference implementation does not implement every contract; in particular App Sync and Tiles are currently contract-only.
