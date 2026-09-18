# Spatial Read HTTP v0.1

Dependency: Core v0.1.

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

Each returned source descriptor represents one source through one route/access view.

If the same `sourceId` is returned by multiple configured instances or routes, a client treats it as one authoritative source with multiple routes.

## Feature API

A source SHOULD link to an OGC API Features landing page.

Typical shape:

```http
GET /spatial/v1/sources/{sourceId}/features
GET /spatial/v1/sources/{sourceId}/features/conformance
GET /spatial/v1/sources/{sourceId}/features/collections
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}/items
GET /spatial/v1/sources/{sourceId}/features/collections/{collectionId}/items/{objectId}
```

Clients SHOULD follow links published by the provider rather than construct pagination URLs.

## Snapshots

```http
POST /spatial/v1/sources/{sourceId}/snapshots
GET  /spatial/v1/snapshots/{snapshotId}/features/collections
GET  /spatial/v1/snapshots/{snapshotId}/features/collections/{collectionId}/items
```

The snapshot is immutable during its advertised lifetime and bound to the current principal, route, source and access view.

The server MUST NOT continue an expired snapshot with live data. It returns `SNAPSHOT_EXPIRED`.

## Access-view revision

`viewRevision` represents the logical visible state through the current route/principal authorization context.

It MUST change when the visible data set changes, including relevant permission changes.

`sourceRevision`, when available, describes the authoritative source state and is not sufficient on its own for client cache validation.

## Cache activation

Clients keep their last verified cache active while downloading a replacement snapshot.

Only a complete and verified replacement may be activated atomically.

A partially downloaded snapshot MUST NOT replace the previous working cache.

## Relevant errors

- `SOURCE_NOT_FOUND`
- `SNAPSHOT_EXPIRED`
- `ACCESS_DENIED`
- `UPSTREAM_UNAVAILABLE`
