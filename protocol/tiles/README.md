# Tiles and Offline Areas v0.1

Dependencies: Core v0.1 and Spatial Read v0.1.

The tile contract supplies tile sets. Offline-area definitions remain user/application state and do not belong to the tile provider.

## Separation

```text
Tile Service
= supplies tiles

Offline Area Definition
= describes what the user wants available offline

Offline Package
= materialized tiles stored on one device
```

Transient map cache is disposable. A user-managed offline package is intentional local data and MUST NOT be evicted as ordinary cache.

## Tile identity

A tile set is identified by:

```text
(sourceId, tileSetId)
```

Federation preserves both identifiers.

Implementations SHOULD use OGC API Tiles and OGC Tile Matrix Set metadata rather than hard-code XYZ assumptions.

## Offline policy

A tile set exposes policy for:

- offline download,
- maximum matrix/zoom levels,
- maximum planned tile count or size where applicable,
- attribution,
- whether tile bytes may be included in a portable backup.

A server MUST NOT accept an arbitrary upstream URL from the client. Requests address configured `sourceId`, `tileSetId` and tile coordinates only.

## Offline plan

Before a mass download, clients SHOULD request a plan describing:

- effective tile matrix range,
- tile count,
- estimated size if available,
- policy limits,
- tile set revision,
- consistency class.

A provider may reduce the effective requested range according to policy. The client must display the effective result before download.

The provider does not persist the user's named offline area as account state.

## Materialization

Offline-area definition:

```text
scope = account
```

Materialization status is device-specific.

Account Sync transfers the definition but not reproducible tile bytes.

A second device can therefore show the offline area as configured but not yet downloaded.

## Portable backup

A full encrypted portable backup SHOULD include user-managed offline packages when the tile policy permits portable backup.

Transient tile cache is excluded.

If portable backup of tile bytes is denied, the area definition is retained and the package must be downloaded again after restore.

## Staleness

A changed tile-set revision may mark a local offline package stale.

Stale does not mean unusable. The UI should expose age/revision and offer refresh without silently deleting the package.
