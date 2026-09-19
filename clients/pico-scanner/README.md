# P4U Spatial Scanner for PICO

This is the first real Android application shell for the PICO headset.

## Current scope

The app currently provides:

- multiple named P4U Bridge profiles with an explicit active Bridge,
- configurable P4U Bridge URLs,
- bridge discovery through `/.well-known/open-spatial-interop`,
- discovery of the `xr-app` update contract,
- Stable-channel release lookup,
- comparison by Android `versionCode`,
- bounded APK download,
- package-size and SHA-256 verification,
- APK signing-certificate verification,
- comparison against the installed application's signer,
- Android/PICO interactive package installation.

It intentionally does **not** yet implement the spatial scanner/MR capture UI. The current purpose is to turn the installation/update contract into a buildable Android application before scanner features are layered on top.

## Build

The project uses Android Gradle Plugin 9.4.1 with built-in Kotlin support.

Required locally:

- JDK 17,
- Android SDK with API 36,
- Gradle 9.6.x or Android Studio Quail 4.

From this directory:

```bash
gradle :app:assembleDebug
```

A Gradle wrapper binary is intentionally not committed yet; generate the wrapper once Gradle 9.6 is available in the Android build environment.

Release version metadata can be supplied without editing the project:

```bash
gradle :app:assembleRelease -PP4U_VERSION_NAME=0.1.1 -PP4U_VERSION_CODE=2
```

Release signing is injected through `P4U_ANDROID_KEYSTORE_PATH`, `P4U_ANDROID_KEYSTORE_PASSWORD`, `P4U_ANDROID_KEY_ALIAS` and `P4U_ANDROID_KEY_PASSWORD`. The keystore must never be committed.

## Install

The debug APK can be installed using the normal administrator-controlled PICO/Android sideload path for development.

Production releases must be signed with the long-lived P4U Scanner signing key. Update descriptors must contain the SHA-256 fingerprint of that same certificate.

The canonical production procedure is documented in [the PICO Scanner release runbook](../../docs/pico-scanner-release.md). GitHub Actions workflow `Publish PICO Scanner APK` builds, signs, verifies and publishes the APK plus `release-descriptor.json`. Publishing that descriptor to a Bridge remains an explicit administrator action.

## Persistence boundary

Updating the package must never clear application data. Future scanner data will use independent stores for:

```text
outbox/   primary, not-yet-uploaded captures
cache/    reconstructable data
state/    synchronization state
secure    device refresh credentials / identity
updates/  temporary verified APKs only
```

Only `updates/` may be cleaned as part of update housekeeping.


## Multiple Bridge instances

The headset can store multiple named Bridge profiles and switch the active instance explicitly.

The physical headset keeps one stable device identity, but trust and primary data are scoped to the Bridge profile:

- each Bridge profile has its own URL and update channel;
- refresh credentials are encrypted under a profile-specific Android Keystore alias;
- scan outboxes live below `outbox/bridges/<profileId>/`;
- switching the active Bridge never moves pending scans to another Bridge;
- pairing/authorization is therefore performed independently for every Bridge instance;
- application updates are checked against the active Bridge and its configured channel.

The old single `bridge-url` preference is migrated to the first named profile on upgrade. The legacy preference is not used after migration.

A Bridge profile must not be deleted together with its secure credentials or outbox until pending primary data has been handled. The current UI intentionally supports adding and switching profiles first; destructive profile removal should only be exposed together with an explicit pending-data guard.


## Naming

IDs are technical identities and are not intended as the primary UI label.

Each saved Bridge has both:

- a **local alias** chosen on this headset;
- a **global instance name** learned from Bridge discovery.

The headset likewise has a **local device name** configured on the PICO. It is sent during pairing as the device-provided name. A Bridge administrator may independently assign a **global device name** to the paired device. The Bridge global name takes precedence in Bridge-side presentation without changing the PICO-local name.

Renaming any of these labels never changes `instanceId`, `deviceId`, pairing credentials or outbox ownership.
