# Spatial Relations v0.1

Dependencies: Core v0.1 and Spatial Read/Write.

Relations are first-class source-owned assertions between Spatial objects.

They allow links such as:

```text
Fire asset --located-in--> RCHKB room
RCHKB room --served-by--> Fire infrastructure object
building --contains--> room
asset --related-to--> asset
```

without transferring authority over either endpoint.

## Relation authority

Each relation belongs to exactly one authoritative Spatial Source.

Its identity is:

```text
(relationSourceId, relationId)
```

The relation source is authoritative only for the assertion itself.

It does not become authoritative for its subject or object.

## Relation data

A relation contains:

- relationId,
- sourceId of the relation authority,
- predicate,
- subject object reference,
- object object reference,
- revision,
- optional properties,
- provenance,
- optional confidence.

Subject and object references use the existing:

```text
(sourceId, objectId)
```

identity.

The subject and object MAY belong to different sources.

## Collection model

Relations are exposed through normal Spatial collections.

Collection metadata uses:

```json
{
  "itemKind": "relation"
}
```

A relation collection may therefore be snapshotted, cached and written using the same source/collection operation machinery.

Feature collections use `itemKind = feature`.

A provider SHOULD NOT mix unrelated feature and relation representations in one collection in v0.1.

## Read

Generic collection endpoints are used:

```http
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}/items
GET /spatial/v1/sources/{sourceId}/collections/{collectionId}/items/{relationId}
```

A relation collection response uses the relation schemas defined by this profile.

Providers SHOULD support efficient filtering by subject and object reference when relation volumes make full scans impractical, but the exact query extension is not mandatory in v0.1.

## Write

Create/update/delete use normal Spatial Write operations.

The operation target points at the relation-authority source and relation collection.

The operation payload is a Relation.

Creating a relation MUST NOT silently mutate either endpoint object.

Deleting an endpoint object does not automatically authorize deletion or mutation of a relation owned by another source.

## Unresolved references

A client may receive a relation whose other endpoint is:

- currently offline,
- not configured,
- not authorized for the current principal,
- deleted,
- otherwise unresolved.

The client MUST treat this as an unresolved reference rather than inventing endpoint data or dropping the relation.

## Cross-source security

A relation asserting that object A is linked to object B does not grant read access to B.

Clients MUST perform normal authorization/source resolution before displaying protected target details.

## Provenance

Provenance SHOULD identify how the assertion was created, for example:

- manual,
- imported,
- deterministic rule,
- XR observation,
- AI-assisted suggestion promoted by a user/workflow.

AI-derived assertions SHOULD retain confidence and provenance.

## No distributed transaction

Creating a cross-source relation is a write to the relation's own source only.

v0.1 does not attempt an atomic transaction across subject source, object source and relation source.
