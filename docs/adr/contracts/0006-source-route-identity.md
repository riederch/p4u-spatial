# ADR 0006: Source and Route Identity

Status: accepted

## Decision

Spatial authority and transport are separate concepts.

A stable `sourceId` identifies the authoritative spatial source.

A `routeId`, scoped by `instanceId`, identifies one transport path to that source.

The global identity of a spatial object is `(sourceId, objectId)`.

Federation MUST preserve upstream `sourceId`.

## Consequences

Direct and federated access to the same source can be deduplicated.

Direct-route preference is a routing rule and never changes data authority.

Different routes may expose different access views and capabilities.

## Implementation anchors

- `protocol/spatial/http.md` — source/route semantics on the HTTP binding.
- `protocol/schemas/spatial/source.schema.json` — stable source identity.
- `protocol/schemas/spatial/route.schema.json` — transport route identity and metadata.
- `bridge/src/services/spatial-read-service.ts` — stable local sourceId distinct from routeId.
- `bridge/src/services/federation-service.ts` — preserves upstream sourceId while projecting a local federated route.

## Reconciliation note

The reference Bridge implements the source/route split for local and federated reads. Client-side route deduplication/preference across multiple simultaneously discovered routes is not yet a complete headset feature.
