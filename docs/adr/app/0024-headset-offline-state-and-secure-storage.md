# ADR 0024: Headset Offline State, Durable Outbox and Secure Credentials

Status: Accepted

Date: 2026-09-21

## Historical note

No original ADR for the headset storage model remains available. This ADR reconstructs and
establishes the intended architecture from the current implementation and documentation.

## Context

The headset must remain usable through intermittent connectivity and application updates. Local
data has different durability and confidentiality semantics: some data is reconstructable cache,
some is primary evidence not yet acknowledged by the Bridge, some is non-secret synchronization
state, and some is long-lived credential material.

Treating all local files as equivalent risks either losing primary capture evidence or retaining
sensitive credentials in ordinary application storage.

## Decision

Headset local storage is separated by semantics into four classes:

### Cache

Cache contains reconstructable server-derived data.

- It may be evicted or rebuilt.
- Cache cleanup MUST NOT remove primary outbox data.
- Stale/offline cache state should be visible to the user where relevant.

### Durable outbox

The outbox contains primary client-created data that has not yet received the required durable
Bridge acknowledgement.

- Outbox entries survive application restart and network loss.
- Logical upload identities remain stable across retries.
- Content integrity is verified using hashes.
- The only local primary copy MUST NOT be deleted before durable acknowledgement.
- Generic cache cleanup, application update or transient network failure MUST NOT silently destroy
  pending outbox data.

For XR scan upload, `committed` is the current durable Bridge acknowledgement that permits the
client to remove the local outbox copy.

### State

State contains non-secret synchronization/runtime metadata such as revisions, retry state, cursors
or update progress. It is persisted when needed for correct restart behavior but is not a credential
store.

### Credentials

Long-lived device/refresh credentials are stored using secure platform facilities. On Android/PICO,
refresh credentials are protected by Android Keystore-backed encryption and are not stored as
plain application files.

Revocation may make credentials unusable, but pending primary outbox data is not treated as generic
cache and requires an explicit product/security policy before destructive removal.

## Consequences

- Offline capture can continue without conflating evidence with cache.
- Retry after process/device restart is safe.
- Cache cleanup can be aggressive without risking uncommitted primary data.
- Credentials have a stronger storage boundary than ordinary application state.
- Application updates must preserve the data directory semantics required by outbox and credentials.
- Encryption-at-rest policy for reconstructable cached spatial/display data is not decided by this
  ADR and may be strengthened separately.

## Implementation anchors

- `docs/offline-storage.md` — storage-class semantics and offline behavior.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/ScanOutbox.kt` — durable on-device scan staging with stable IDs and hashes.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/ScanOutboxUploader.kt` — retry/resume and deletion only after committed acknowledgement.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/SecureSessionStore.kt` — Android Keystore-backed refresh-token protection.
- `protocol/xr/app-lifecycle.md` — application updates preserve durable outbox and credential state.

## Related decisions

- ADR 0002: Authentication and device pairing
- ADR 0009: Durable Relay Acknowledgement
- ADR 0023: XR Application Update Trust and Release Lifecycle
