# XR Client Durable State v0.1

## Purpose

The XR client must remain safe across process death, headset reboot, network loss and application update.

The client separates state by durability class:

```text
identity/   stable device identity
secure/     refresh credential and other secrets
outbox/     primary captures not yet durably committed upstream
cache/      reconstructable server data
state/      synchronization/update control state
updates/    temporary verified application packages
```

## Pairing state machine

```text
unpaired
  -> qr-received
  -> claimed
  -> awaiting-approval
  -> authorized
  -> active
```

Terminal pairing outcomes:

- rejected,
- expired,
- revoked.

The device ID is generated once and persists across normal application updates.

The pairing secret is held only until a claim succeeds and MUST then be discarded.

The access token may be kept in memory. The refresh credential MUST be stored using OS-backed secure storage.

If an access token expires, the client refreshes once and retries the interrupted authenticated request.

If refresh returns `DEVICE_REVOKED` or an invalid/expired refresh credential, the client transitions to unpaired/re-pair-required without deleting the outbox.

## Scan outbox

Each scan is an immutable outbox directory until bridge commit succeeds:

```text
outbox/scans/<scanId>/
├── manifest.json
└── files/
    └── ...
```

The manifest contains the SHA-256 digest of every file.

Upload algorithm:

1. PUT manifest.
2. Read `verifiedFiles` and `missingFiles`.
3. Upload only missing files.
4. POST commit.
5. Delete the local scan directory only if the bridge reports state `committed`.

A process/network failure at any earlier step leaves the outbox unchanged.

On restart, the client repeats PUT manifest. Because manifest/file uploads and commit are idempotent, this reconstructs upload progress without a separate client-side transaction log.

## Ordering

Multiple scans MAY upload in creation order.

One failed scan MUST NOT cause deletion or mutation of later scans. Implementations MAY continue with later scans after classifying a failure as retryable/non-retryable.

## Retry classes

Retryable:

- connection failure,
- timeout,
- HTTP 5xx,
- temporary 429/rate limit,
- expired access token after successful refresh.

Requires user/admin action:

- device disabled,
- device revoked,
- pairing required.

Permanent data conflict requiring intervention:

- `SCAN_ID_CONFLICT`,
- local file hash no longer matches immutable manifest,
- unsupported schema.

## Updates

Application update code MUST NOT clear `identity/`, `secure/` or `outbox/`.

The updater may remove only its own `updates/` temporary files after successful installation or explicit cleanup.
