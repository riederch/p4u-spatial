# ADR 0008: App Sync Independence

Status: accepted

## Decision

App Sync is independent of Spatial and stores generic application workspace state.

An Account Provider does not need GIS knowledge and does not become a Spatial Provider merely because an application syncs GeoJSON or pending provider operations through it.

## Consequences

The dedicated MultiGIS backend can be a separate Fire instance from domain/content Fire instances.

Domain instances such as WWG may remain pure Content Providers.

Provider data is not copied to the Account Provider as a second canonical source.

## Implementation anchors

- `protocol/app-sync/README.md` — opaque application workspace semantics independent of Spatial.
- `protocol/workflows/publish.md` — explicit publication boundary from app-owned state to Spatial authority.
- `protocol/README.md` — App Sync and Spatial are sibling contracts over Core.

## Reconciliation note

This repository currently specifies App Sync but does not contain an Account Provider implementation. The decision is therefore contract-complete but not reference-implementation-complete.
