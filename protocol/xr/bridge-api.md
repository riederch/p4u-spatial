# XR Bridge Profile API v0.1

Dependencies: Core v0.1 and XR Profile v0.1. Spatial is optional.

The XR contract base URL is obtained from Core discovery. Examples below are relative paths.

The historical P4U `/api/v1` path may remain a compatibility alias; it is not a protocol-wide fixed path.

## Authentication

Except pairing claim/status, protected XR endpoints require a valid Core-compatible bearer credential and an authorized XR device context.

The instance checks:

1. credential validity,
2. device authorization state,
3. requested XR scope,
4. any resource-specific permissions.

A revoked XR authorization receives a stable error such as `DEVICE_REVOKED`.

## Pairing

```http
POST /pairing/claim
GET  /pairing/claims/{claimId}
```

See [pairing.md](pairing.md).

## Session bootstrap refresh

The P4U reference profile may expose:

```http
POST /session/refresh
POST /session/logout
```

These endpoints refresh/revoke bridge/Core credentials. They never expose repository-provider credentials.

## Device

```http
GET /device
```

Returns the XR device descriptor, authorization state, runtime capabilities and effective XR scopes.

Runtime capabilities are hardware/runtime facts and are distinct from protocol capabilities and authorization scopes.

## Display bundle

A Git-backed or generated XR display profile may expose:

```http
GET /display/manifest
GET /display/files/{path}
```

Display data is generated/reconstructable. It is not the canonical Spatial model.

The server MUST reject traversal outside the configured display root.

Conditional requests SHOULD use ETag or equivalent revision metadata.

## Scan upload

XR scan upload remains a deterministic three-stage transaction.

### Manifest

```http
PUT /scans/{scanId}/manifest
```

Requirements:

- URL scan ID equals manifest scan ID,
- identical retry is idempotent,
- reuse with different manifest content returns `SCAN_ID_CONFLICT`.

The server reports already present/verified files.

### Files

```http
PUT /scans/{scanId}/files/{path}
```

Each file must have declared content type/hash metadata.

The bridge verifies content integrity before acknowledging the file.

Repeated identical upload is idempotent.

### Commit

```http
POST /scans/{scanId}/commit
```

Commit validates all required files and durably stores the scan using the configured capture repository/storage provider.

Only after successful durable scan commit may the XR client remove that scan from its only local outbox copy.

Scan commit means the raw XR capture is durable. It does not mean that optional later semantic enrichment or promotion into a canonical Spatial model has completed.

## Observations

```http
PUT /observations/{observationId}
```

This endpoint stores XR-specific capture evidence idempotently.

When the intended operation is a normal mutation of an existing canonical Spatial Source object, clients SHOULD use Spatial Write instead.

An XR observation may reference a canonical subject using `sourceId` + `objectId`.

## Tasks

```http
GET /tasks
GET /tasks/{taskId}
PUT /tasks/{taskId}/answer
```

Task answers produce XR observations/evidence. They MUST NOT silently mutate canonical Spatial model data unless an explicit authorized Spatial Write operation is created.

## Errors

XR errors use the Core error envelope.

XR-specific codes may include:

- `DEVICE_REVOKED`
- `DEVICE_DISABLED`
- `PAIRING_EXPIRED`
- `PAIRING_ALREADY_USED`
- `SCAN_ID_CONFLICT`
- `SCAN_INCOMPLETE`
- `HASH_MISMATCH`
- `UNSUPPORTED_SCHEMA`
- `INVALID_PATH`

Generic auth/scope/capability errors come from Core.
