# Spatial Read Contract v0.1

Dependency: Core v0.1.

Spatial Read models authoritative sources independently from the routes used to reach them.

## Model

```text
Instance
  └── Route
       └── Source
            └── Collection
                 └── Feature
```

## Source identity

A source has a stable `sourceId`.

Federation MUST preserve the upstream `sourceId`.

The global identity of a spatial object is:

```text
(sourceId, objectId)
```

`objectId` MUST be unique within the source. Adapters may namespace native IDs if required.

## Route identity

A route identifies a transport path to a source and is identified by:

```text
(instanceId, routeId)
```

Initial route kinds:

- `direct`
- `federated`

Multiple routes carrying the same `sourceId` represent one source, not duplicate data sources.

## Access view

Equal `sourceId` does not imply equal visible data.

A direct user login may expose more objects than a federation service account. Therefore each route/principal view has an opaque `viewRevision`.

The `viewRevision` MUST change whenever the logically visible data set changes, including relevant authorization changes.

Client caches MUST be isolated at least by:

```text
instanceId
principalId
routeId
sourceId
```

A client MUST NOT union different access views implicitly.

## OGC API Features

Providers SHOULD expose feature collections using OGC API Features and GeoJSON where applicable.

A source exposes a feature landing page and collections/items beneath it.

Provider-native storage remains unrestricted. Fire may use Common_Asset/Common_Gis; a Git adapter may use files; neither storage model is part of this contract.

## Revision semantics

All protocol revisions are opaque. Clients may test equality or inequality only.

An optional `sourceRevision` describes the authoritative source state.

The mandatory `viewRevision` is the cache/sync revision for the current access view.

## Snapshot sync

v0.1 requires consistent full snapshots rather than delta sync.

Conceptual endpoint:

```http
POST /spatial/v1/sources/{sourceId}/snapshots
```

A snapshot is bound to the instance, principal, route, source and access view. It is immutable for its lifetime.

A paged snapshot MUST represent one logical state even if the live source changes while the client is downloading it.

Clients retain the previous working cache until the new snapshot is fully fetched and verified, then switch atomically.

## Delivery provenance

A federation provider MUST distinguish live upstream data from cached data.

Example states:

- live
- cache/current
- cache/stale
- cache/unknown

A stale cache may remain useful but MUST NOT be represented as live.

## Default read routing

Recommended preference:

1. direct live route,
2. federated live route,
3. federated cached route,
4. local client cache.

This affects transport only and never changes source authority.
