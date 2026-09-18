# ADR 0014: Cross-source Relation Authority

Status: accepted

## Decision

A relation is a first-class assertion owned by exactly one Spatial Source.

Its subject and object use normal `(sourceId, objectId)` references and may belong to other sources.

The relation source is authoritative for the assertion only.

## Consequences

Cross-source links do not transfer authority between providers.

Relations can survive temporarily unresolved/inaccessible endpoints.

Relation writes use normal Spatial optimistic concurrency and do not require distributed transactions across endpoint sources.
