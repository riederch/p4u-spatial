# XR v0.1 Conformance

## XR-001 Pairing secret

Pairing secret is single-use, expires and is never exposed as a repository/upstream credential.

## XR-002 Core identity

After pairing, the XR client authenticates as the same Core principal/device context used by other contracts on that instance.

## XR-003 Revocation

Revoked device credentials fail on subsequent protected requests.

## XR-004 Scan retry

Repeat the same scan manifest/file upload after connection loss.

Expected: no duplicate primary scan and verified existing files are reused.

## XR-005 Scan ID conflict

Reuse scanId with different manifest content.

Expected: explicit conflict.

## XR-006 Durable scan commit

Client may remove its only scan outbox copy only after the bridge reports durable scan commit.

## XR-007 Canonical identity

XR vendor anchor IDs never replace `(sourceId, objectId)` when referencing an existing Spatial object.

## XR-008 Task answer boundary

Task answer produces evidence/observation and does not silently mutate canonical Spatial model data.
