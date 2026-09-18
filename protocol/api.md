# Bridge API v1

Base path: `/api/v1`

JSON is used for control messages. Binary/large scan files are uploaded as raw request bodies with hashes declared in the scan manifest.

## Authentication

All device endpoints except pairing claim/status require a valid bridge access token and an authorized device.

The bridge checks on every authenticated request:

1. access-token validity,
2. device status is `authorized`,
3. requested operation is included in device scopes.

A revoked device receives `401 DEVICE_REVOKED`.

## Pairing

- `POST /pairing/claim`
- `GET /pairing/claims/{claimId}`

See [pairing.md](pairing.md).

## Session

- `POST /session/refresh`
- `POST /session/logout`

Refresh credentials are bridge credentials, never Git-provider credentials.

## Device

### GET /device

Returns the current device descriptor, scopes and authorization state.

## Display sync

### GET /display/manifest

Returns the current display revision and file hashes.

Supports conditional requests using an ETag derived from the display revision.

### GET /display/files/{path}

Returns one display artifact. The path must resolve below the configured display root; traversal outside that root is rejected.

## Scan upload

Scan upload is a three-stage deterministic transaction.

### PUT /scans/{scanId}/manifest

Creates or resumes a scan upload.

Requirements:

- `scanId` in the URL equals the manifest scan ID.
- Repeating the same manifest is idempotent.
- Reusing a scan ID with different manifest content returns `409 SCAN_ID_CONFLICT`.

Response reports which files are already present and verified.

### PUT /scans/{scanId}/files/{path}

Uploads one file declared by the manifest.

Headers:

- `Content-Type`
- `Digest: sha-256=...` or equivalent API field defined by the implementation

The bridge verifies the content hash before accepting the file.

Repeated upload of identical content is idempotent.

### POST /scans/{scanId}/commit

Validates that every required file declared by the manifest is present and hash-correct, then durably persists the scan through the configured repository provider.

Only after this endpoint returns success may the headset remove the scan from its outbox.

A committed scan cannot be silently replaced.

## Observations

### PUT /observations/{observationId}

Creates an observation idempotently. Reusing the ID with different content returns a conflict.

## Tasks

- `GET /tasks`
- `GET /tasks/{taskId}`
- `PUT /tasks/{taskId}/answer`

Task answers produce observations; they do not directly mutate canonical model data from the headset.

## Errors

Errors use a stable JSON envelope:

```json
{
  "error": {
    "code": "HASH_MISMATCH",
    "message": "Uploaded content does not match the declared SHA-256.",
    "requestId": "..."
  }
}
```

Initial stable error codes:

- `DEVICE_REVOKED`
- `DEVICE_DISABLED`
- `SESSION_EXPIRED`
- `SCOPE_REQUIRED`
- `PAIRING_EXPIRED`
- `PAIRING_ALREADY_USED`
- `SCAN_ID_CONFLICT`
- `SCAN_INCOMPLETE`
- `HASH_MISMATCH`
- `UNSUPPORTED_SCHEMA`
- `CAPABILITY_REQUIRED`
- `INVALID_PATH`

## Versioning

Breaking protocol changes require a new API major version. Schema evolution inside a compatible API version uses explicit `schemaVersion` fields.
