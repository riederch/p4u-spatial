# Git Repository Backend Profile Conformance

## GIT-001 Layer separation

Raw evidence, canonical model and generated display data remain logically separate.

## GIT-002 Raw preservation

Normal processing does not silently rewrite original raw scan evidence.

## GIT-003 Display rebuild

Deleting generated display output can be repaired from retained model/source inputs.

## GIT-004 Provider independence

Repository credentials never need to be present on the XR client.

## GIT-005 Stable Spatial identity

Git path or commit changes do not by themselves create a new sourceId/objectId.

## GIT-006 Revision opacity

If a commit hash is exposed as sourceRevision, clients still treat it as an opaque equality token.

## GIT-007 Retry-safe capture persistence

Repeated identical scan commit does not create duplicate logical raw captures.
