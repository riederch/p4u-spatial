# PUBLISH Workflow v0.1 Conformance

## PUB-001 No implicit publication

Sync a local GeoJSON layer through App Sync.

Expected: it does not become a Spatial Source merely because it exists on the Account Provider.

## PUB-002 Stable operation IDs

Interrupt publication after source committed an object but before client receives response.

Expected: retry uses same Spatial operationId and creates no duplicate object.

## PUB-003 Partial resume

Interrupt a 100-object publish after 70 commits.

Expected: job records partial state and resumes only unresolved operations.

## PUB-004 Server-assigned IDs

Publish objects to a provider that assigns object IDs.

Expected: publish mapping records localObjectId -> (sourceId, objectId).

## PUB-005 Relation rewrite

Publish two local objects with a relation.

Expected: relation is created only after endpoint mappings are known and uses authoritative object refs.

## PUB-006 Account Provider boundary

Account Provider stores/syncs the publish job but does not execute Spatial writes by default.

## PUB-007 No implicit continuous sync

Edit local source after successful publish.

Expected: published provider copy does not silently change.

## PUB-008 Cross-device continuation

Second device receives the publish job and has destination authorization.

Expected: it may continue using the original operation/upload IDs without duplicates.
