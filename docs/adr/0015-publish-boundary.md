# ADR 0015: Publish Boundary between App State and Spatial Authority

Status: accepted

## Decision

Local/imported MultiGIS data and App Sync workspace data do not automatically become Spatial Provider data.

Publication is an explicit client workflow using Spatial Write against an existing writable Content Provider.

The Account Provider stores publish/outbox state but does not automatically execute publication.

## Consequences

A synchronized GeoJSON import remains private/application-owned until explicitly published.

Publication records local-to-authoritative identity mappings.

Publishing is not continuous bidirectional synchronization in v0.1.

The dedicated MultiGIS Account Provider does not need to implement Spatial merely to back up local GIS content.
