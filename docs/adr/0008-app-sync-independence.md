# ADR 0008: App Sync Independence

Status: accepted

## Decision

App Sync is independent of Spatial and stores generic application workspace state.

An Account Provider does not need GIS knowledge and does not become a Spatial Provider merely because an application syncs GeoJSON or pending provider operations through it.

## Consequences

The dedicated MultiGIS backend can be a separate Fire instance from domain/content Fire instances.

Domain instances such as WWG may remain pure Content Providers.

Provider data is not copied to the Account Provider as a second canonical source.
