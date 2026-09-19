# picoVr Scanner release runbook

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

For automatic OTA publication to the Bridge, additionally configure:

- `P4U_BRIDGE_URL` — externally reachable base URL of the P4U Bridge, for example `https://spatial.example.org`;
- `P4U_BRIDGE_ADMIN_KEY` — deployment/release administration key accepted by the Bridge.

Do not commit the keystore, passwords or Bridge administration key to the repository.

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

Run the GitHub Actions workflow **Publish picoVr Scanner APK** manually.

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
8. optionally publishes the release descriptor directly to the configured Bridge;
9. uploads the same files as workflow artifacts.

A beta release is a GitHub prerelease. A stable release is marked as the latest release.

## Bridge publication

The GitHub Release alone does not make the version visible to headsets. With `publish_to_bridge=true` (the default), the workflow publishes the generated descriptor automatically to the target Bridge using the configured GitHub secrets.

For manual recovery or a Bridge that is not reachable from GitHub Actions, publish the generated descriptor to the target Bridge:

```text
PUT /api/v1/admin/xr-app/releases/<releaseId>
X-P4U-Admin-Key: <bridge admin key>
Content-Type: application/json
```

The request body is the generated `release-descriptor.json` unchanged.

The automatic workflow step preserves the same trust boundary: GitHub Actions builds/signs the APK and only sends the signed release descriptor to the Bridge. The Bridge never receives the Android signing key.

For a first deployment, publish to `beta`, validate on a test picoVr, then create/promote an explicitly versioned `stable` release. Do not silently move a device between channels.

## First installation

The very first installation cannot use self-update because no trusted application exists on the headset yet:

```text
signed APK
  -> verify digest/certificate
  -> administrator-controlled picoVr/Android sideload
  -> launch
  -> configure/discover Bridge
  -> QR pairing
  -> administrator approval
```

After this bootstrap, normal newer-version delivery uses the Bridge `xr-app` contract. No USB connection is required for later releases.

## Self-update

Once paired, the application discovers the Bridge update service, obtains the latest descriptor for its selected channel, downloads the APK from the descriptor URL, verifies size, SHA-256 and signing identity, and hands the verified APK to the Android/picoVr installer.

Normal deployment after the one-time bootstrap is therefore:

```text
GitHub Actions
  -> signed APK + release descriptor
  -> GitHub Release
  -> descriptor published to Bridge
  -> picoVr: "Auf Update prüfen"
  -> APK download + signature verification
  -> Android/PICO installation confirmation
```

The headset does not need to be connected to a development PC. Standard Android package security still requires user confirmation on the headset unless the device is managed with a privileged/device-owner installation mechanism.

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
