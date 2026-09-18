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
