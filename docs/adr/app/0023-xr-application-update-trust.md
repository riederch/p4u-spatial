# ADR 0023: XR Application Update Trust and Release Lifecycle

Status: Accepted

Date: 2026-09-21

## Historical note

No original ADR or complete decision record for this architecture remains available. This ADR
reconstructs and establishes the current intended architecture from the existing implementation,
protocol documentation and release runbook. It must not be read as evidence of the original
historical rationale.

The discovery namespace/key is defined separately by ADR 0027: application distribution is exposed
as the independent `xr-app` contract.

## Context

The XR client is a signed Android application running on PICO hardware. It needs a trustworthy
update path that does not put repository credentials or Android signing keys on the headset or
Bridge and that does not couple application-version lifecycle to protocol-version lifecycle.

Application updates must also preserve durable local state such as pairing/session state and
pending outbox data.

## Decision

XR application distribution uses signed release descriptors and Android signing identity as a
separate application-lifecycle trust boundary.

### First installation

Initial APK installation is separate from Bridge pairing.

A trusted signed APK is installed first. Only after the application starts does the device discover
or configure a Bridge and perform pairing. APK distribution MUST NOT bootstrap Bridge, repository
or federation credentials.

### Release descriptor

An update descriptor contains at least:

- stable release ID,
- semantic presentation version,
- monotonically increasing Android `versionCode`,
- explicit release channel,
- target platform,
- protocol compatibility requirements,
- package size,
- package SHA-256,
- Android signing-certificate SHA-256 fingerprint,
- package location,
- mandatory/optional update metadata.

The Bridge may publish and serve release metadata, but it MUST NOT possess the Android signing
private key.

### Verification

Before installation, the client verifies:

1. target platform,
2. newer `versionCode`,
3. declared protocol compatibility,
4. exact package size,
5. package SHA-256,
6. descriptor signing fingerprint,
7. equality with the installed application's trusted signing identity.

A matching digest alone is insufficient if the signing identity differs.

### Channels

The initial channels are `stable` and `beta`.

Changing a device between channels is an explicit administrator/user action. A server MUST NOT
silently move a device from stable to beta.

### Installation state

Android/PICO remains the final installer authority. User/administrator confirmation is a supported
normal state when unattended installation is unavailable.

An update is not considered complete until the newly installed application starts and confirms the
expected `versionCode`.

Update downloads and updater state are separate from durable application outbox data and secure
credentials. Failed download, verification or installation MUST leave the currently installed
application and durable application data intact.

Application version and protocol version remain independent.

## Consequences

- Compromise of the content/repository source alone is insufficient to install an APK signed by a
  different key.
- The Bridge can distribute release metadata without receiving signing secrets.
- Release sources may change without changing the trust model.
- Updates can require explicit user/PICO installation confirmation.
- Forward-safe state migrations are required because automatic downgrade/rollback is not assumed.
- Pending primary/outbox data must survive application update attempts.

## Implementation anchors

- `protocol/xr/app-lifecycle.md` — normative XR application lifecycle and verification behavior.
- `bridge/src/services/xr-app-release-service.ts` — persisted release descriptors, channels, versionCode uniqueness and package integrity/signing metadata.
- `tools/xr-updater-reference/src/updater.ts` — reference verification and persisted update-state machine.
- `.github/workflows/publish-pico-scanner.yml` — signed APK build, digest/signing metadata generation and release publication.
- `docs/pico-scanner-release.md` — operational release and acceptance runbook.

## Related decisions

- ADR 0002: Authentication and device pairing
- ADR 0013: XR Is a Profile over Core
- ADR 0027: Separate XR Application Lifecycle Contract and Discovery Registry
- ADR 0024: Headset Offline State, Durable Outbox and Secure Credentials
