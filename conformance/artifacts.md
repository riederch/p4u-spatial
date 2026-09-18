# ARTIFACTS v0.1 Conformance

## ART-001 Integrity

Upload declared SHA-256 and bytes that do not match.

Expected: commit fails with `HASH_MISMATCH`.

## ART-002 Immutability

Commit artifact, then attempt to replace its bytes.

Expected: original artifact bytes remain unchanged; replacement requires a new artifact identity.

## ART-003 Upload retry

Lose response after upload/session creation and retry the same uploadId with identical metadata.

Expected: same logical upload resumes.

## ART-004 Upload ID conflict

Reuse uploadId with different SHA-256/size/media type.

Expected: explicit `ARTIFACT_UPLOAD_ID_CONFLICT`.

## ART-005 Authorization

Knowing artifactId or SHA-256 without source authorization does not grant content access.

## ART-006 Federation durability

Relay acknowledges a referencing operation as `relay-durable`.

Expected: required artifact payload is also durably available to relay or already committed upstream.

## ART-007 Cache authority

Federation/client artifact cache never changes the artifact's sourceId.
