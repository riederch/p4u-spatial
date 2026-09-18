# Spatial HTTP v0.1

Dependency: Core v0.1.

Spatial defines generic source/collection/item access. Feature collections SHOULD additionally expose OGC API Features compatible links.

## Landing page

```http
GET /spatial/v1
```

The response links to the source collection.

## Sources

```http
GET /spatial/v1/sources
GET /spatial/v1/sources/{sourceId}
```

Each source descriptor represents one authoritative source through one route/access view.

If the same `sourceId` is returned by multiple configured instances/routes, a client models one source with multiple routes.

## Generic collections

```http
GET /spatial/v1/sources/{sourceId}/collections
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}/items
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}/items/{objectId}
```

Collection metadata identifies the item kind.

Initial kinds:

- `feature`
- `relation`

The concrete item representation/media type is determined by the collection/profile.

## OGC API Features

A feature collection SHOULD expose OGC API Features compatible links and GeoJSON representations.

Typical feature-specific landing surface:

```http
GET /spatial/v1/sources/{sourceId}/features
GET /spatial/v1/sources/{sourceId}/features/conformance
GET /spatial/v1/sources/{sourceId}/features/collections
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}/items
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}/items/{objectId}
```

Clients SHOULD follow provider links rather than construct pagination URLs.

## Relations

Relation collections use the same generic collection paths and the Spatial Relations schemas.

Cross-source endpoints are expressed with explicit `(sourceId, objectId)` references.

## Artifacts

Artifacts have a separate binary-resource surface described in [artifacts.md](artifacts.md).

## Snapshots

```http
POST /spatial/v1/sources/{sourceId}/snapshots
GET  /spatial/v1/snapshots/{snapshotId}/collections
GET  /spatial/v1/snapshots/{snapshotId}/collections/{collectionId}/items
```

A snapshot is immutable during its advertised lifetime and bound to the current principal, route, source and access view.

All included collection pages MUST describe one logical snapshot state.

The server MUST NOT continue an expired snapshot with live data. It returns `SNAPSHOT_EXPIRED`.

A feature-only implementation MAY additionally publish a `featuresHref` shortcut.

## Access-view revision

`viewRevision` represents the logical visible state through the current route/principal authorization context.

It MUST change when the visible data set changes, including relevant permission changes.

`sourceRevision`, when available, describes the authoritative source state and is not sufficient on its own for client cache validation.

## Cache activation

Clients keep the last verified cache active while downloading a replacement snapshot.

Only a complete and verified replacement may be activated atomically.

A partially downloaded snapshot MUST NOT replace the previous working cache.

## Relevant errors

- `SOURCE_NOT_FOUND`
- `SNAPSHOT_EXPIRED`
- `ACCESS_DENIED`
- `UPSTREAM_UNAVAILABLE`
