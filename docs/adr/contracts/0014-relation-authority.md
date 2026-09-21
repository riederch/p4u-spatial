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

## Implementation anchors

- `protocol/spatial/relations.md` — source-owned cross-source relation semantics.
- `protocol/schemas/spatial/relation.schema.json` — relation authority, subject and object references.
- `bridge/src/services/spatial-read-service.ts` — exposes relations as a normal source collection.
- `bridge/src/services/spatial-write-service.ts` — relation collection uses ordinary source-scoped Spatial optimistic concurrency.

## Reconciliation note

The reference Bridge supports relation records through the generic collection/write machinery. Efficient subject/object relation filtering is a protocol recommendation and is not implemented yet.
