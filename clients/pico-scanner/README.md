# P4U Spatial Scanner for PICO

This is the first real Android application shell for the PICO headset.

## Current scope

The app currently provides:

- configurable P4U Bridge URL,
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
