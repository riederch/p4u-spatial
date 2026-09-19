# PICO Scanner release runbook

This runbook defines the build, signing and publication path for the P4U Spatial Scanner APK.

## Trust boundary

The Android APK is built and signed outside the P4U Bridge. The Bridge never needs Gradle, the Android SDK, the signing keystore or its passwords.

Production trust is anchored in one long-lived Android signing certificate. Losing that key prevents normal in-place Android updates. Treat the keystore and its recovery copy as critical release infrastructure.

## One-time GitHub setup

Configure these GitHub Actions repository secrets:

- `P4U_ANDROID_KEYSTORE_B64` — base64 encoding of the complete production JKS/PKCS12 keystore file;
- `P4U_ANDROID_KEYSTORE_PASSWORD`;
- `P4U_ANDROID_KEY_ALIAS`;
- `P4U_ANDROID_KEY_PASSWORD`.

Do not commit the keystore or passwords to the repository.

Record the production certificate SHA-256 fingerprint independently so it can be compared with generated release descriptors.

## Development build

Requirements:

- JDK 17;
- Android SDK API 36;
- Android Build Tools 36.0.0;
- Gradle 9.6.x.

From `clients/pico-scanner`:

```bash
gradle :app:assembleDebug
```

The resulting debug APK is for development sideloading only. It is not a production update source.

## Production release

Run the GitHub Actions workflow **Publish PICO Scanner APK** manually.

Inputs:

- `channel`: `beta` or `stable`;
- `version_name`: semantic version such as `0.1.1`;
- `version_code`: strictly increasing positive Android version code;
- `mandatory`: normally false;
- `release_notes`: optional human-readable notes.

The workflow:

1. installs JDK 17, Android SDK 36 / Build Tools 36.0.0 and Gradle 9.6;
2. reconstructs the signing keystore only inside the GitHub runner;
3. builds `:app:assembleRelease` with the supplied version name/code;
4. verifies the resulting APK with `apksigner`;
5. calculates APK SHA-256, exact byte size and signing-certificate SHA-256;
6. generates `release-descriptor.json`;
7. creates a GitHub Release containing the signed APK and descriptor;
8. uploads the same files as workflow artifacts.

A beta release is a GitHub prerelease. A stable release is marked as the latest release.

## Bridge publication

The GitHub Release alone does not make the version visible to headsets. Publish the generated descriptor to the target Bridge:

```text
PUT /api/v1/admin/xr-app/releases/<releaseId>
X-P4U-Admin-Key: <bridge admin key>
Content-Type: application/json
```

The request body is the generated `release-descriptor.json` unchanged.

This is deliberately a separate administrative step. Building/signing an APK does not automatically expose it to production headsets.

For a first deployment, publish to `beta`, validate on a test PICO, then create/promote an explicitly versioned `stable` release. Do not silently move a device between channels.

## First installation

The very first installation cannot use self-update because no trusted application exists on the headset yet:

```text
signed APK
  -> verify digest/certificate
  -> administrator-controlled PICO/Android sideload
  -> launch
  -> configure/discover Bridge
  -> QR pairing
  -> administrator approval
```

After this bootstrap, normal newer-version delivery uses the Bridge `xr-app` contract.

## Self-update

Once paired, the application discovers the Bridge update service, obtains the latest descriptor for its selected channel, downloads the APK from the descriptor URL, verifies size, SHA-256 and signing identity, and hands the verified APK to the Android/PICO installer.

The installed application's data directory is preserved. Pairing identity, refresh credentials and pending outbox data must survive the update.

## Release acceptance checklist

Before a stable descriptor is published to production:

- Android `versionCode` is greater than every earlier stable version;
- APK signature verification succeeds;
- descriptor SHA-256 matches the exact published APK;
- descriptor signing fingerprint matches the production signing certificate;
- beta installation succeeds on a PICO 4 Ultra;
- application starts after update and reports the expected version code;
- existing pairing still works;
- pending offline/outbox data survives;
- Bridge discovery and update lookup work;
- a failed/cancelled install leaves the previous app usable.

The first real release should additionally validate the complete chain from clean sideload through pairing and one subsequent self-update.
