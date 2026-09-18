# RELATIONS v0.1 Conformance

## REL-001 Relation authority

A cross-source relation has one relation source identity independent of subject/object source identities.

## REL-002 No authority transfer

Creating a relation from source A object to source B object does not modify or confer authority over either endpoint.

## REL-003 Unresolved endpoint

Hide or disconnect one endpoint source.

Expected: relation remains available as an unresolved reference where the relation itself is authorized.

## REL-004 Access control

Relation visibility does not grant read access to a protected endpoint.

## REL-005 Snapshot

Relation collection pages inside a Spatial snapshot remain consistent with the same viewRevision.

## REL-006 Write conflict

Update relation with stale revision.

Expected: normal Spatial `conflict`; no silent overwrite.

## REL-007 Delete independence

Deleting an endpoint does not implicitly delete a relation owned by another source.
