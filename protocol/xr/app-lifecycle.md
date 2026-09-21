# XR Application Lifecycle v0.1

## Scope

This profile defines how an XR client discovers, verifies and applies application updates after the application has been bootstrapped onto the headset.

Application distribution is exposed as the independent `xr-app` contract in the Open Interoperability Protocol family. It MUST NOT expose Git/Gitea credentials and MUST NOT couple protocol compatibility to one Android package store.

## First installation

The reference PICO 4 Ultra client uses a signed Android APK.

The initial bootstrap is deliberately separate from device pairing:

1. obtain the signed P4U Spatial Scanner APK from a trusted P4U release channel;
2. verify the published SHA-256 digest and Android signing identity;
3. install the APK using an administrator-controlled Android/PICO installation method;
4. launch the application;
5. configure or discover the P4U bridge;
6. perform XR QR pairing;
7. approve the device at the bridge.

Pairing credentials are created only after installation. APK distribution never contains bridge, repository or federation credentials.

## Update discovery

An XR-capable instance MAY advertise an application update service in discovery:

```json
{
  "contracts": {
    "xr-app": {
      "version": "0.1",
      "href": "https://spatial.example/xr-app/v1"
    }
  }
}
```

The reference endpoints are:

```http
GET /releases/latest?channel=stable&platform=android-pico
GET /releases/{releaseId}/package
```

A release descriptor contains at least:

- release ID,
- semantic application version,
- monotonically increasing Android version code,
- channel,
- platform,
- minimum compatible XR/Core/Spatial contract versions,
- package size,
- SHA-256 digest,
- Android signing-certificate SHA-256 fingerprint,
- package URL,
- optional release notes,
- whether the update is mandatory.

The package URL MAY be short-lived. It MUST NOT contain repository credentials.

## Channels

Initial channels:

- `stable` — normal headset installations;
- `beta` — explicit test installations.

Changing channel is an administrator/user action. A server MUST NOT silently move a device from stable to beta.

## Update decision

The headset compares Android version code first. Semantic version is presentation metadata.

An update is installable only when:

1. platform matches;
2. version code is newer;
3. declared protocol requirements are compatible with the client/bridge environment;
4. the package digest matches;
5. the Android signing identity matches the installed application.

The client MUST reject a package signed by an unexpected key even when its digest matches the release descriptor.

## Download and durable state

Downloads use a temporary update area separate from:

- `outbox/` primary capture data,
- `cache/` reconstructable spatial/display data,
- `state/` synchronization state,
- OS secure storage containing refresh credentials.

Before installation the client MUST flush its local metadata and leave the durable outbox intact.

An application update MUST NOT delete pairing identity, refresh credentials, pending scan uploads, pending observations or other primary outbox data.

## Installation

Android/PICO ultimately controls package installation. The client may download and verify an APK, then invoke the supported platform installer or hand the verified package to an administrator/device-management mechanism.

The application MUST NOT claim an update succeeded until the newly installed version has started and confirmed its version code.

If unattended package installation is unavailable on the headset, the update flow becomes:

```text
download -> verify -> request user/admin installation -> restart -> verify installed version
```

This is a supported state, not an update failure.

## Failure and rollback

Failed download or verification leaves the current application untouched.

A failed installation MUST preserve all application data.

Automatic downgrade/rollback is not assumed because Android signing/version rules and device-management policy may prohibit it. Recovery uses a previously signed release through the same trusted administrative installation path.

Database/state migrations MUST therefore be forward-safe. Destructive migration of the only local outbox copy is prohibited.

## Compatibility

Application version and protocol version are independent.

A bridge may be newer than a headset application while still supporting the contract versions used by that headset.

A mandatory update may only be declared when continued operation would be unsafe or protocol-incompatible. Loss of an optional capability is not by itself grounds to destroy or block pending primary data.

## Security

- release descriptors MUST be obtained over an authenticated transport;
- package SHA-256 MUST be verified before installation;
- Android signing identity MUST be pinned/verified;
- package downloads MUST NOT expose Git/Gitea credentials;
- update metadata MUST NOT contain bridge refresh credentials;
- a compromised content repository alone MUST NOT be sufficient to replace the installed application with a differently signed APK.
