# Android / PICO updater integration reference

This directory maps the platform-neutral `@p4u-spatial/xr-updater-reference` state machine to Android/PICO APIs.

It is intentionally not a standalone Android application yet. The real PICO client should copy or adapt these classes into its Android module.

## Integration boundary

The Android client supplies four adapters:

1. `AndroidPackageInspector`
   - reads installed `versionName`, `longVersionCode` and signing certificate fingerprint,
   - reads the downloaded APK signing certificate fingerprint.

2. `BridgeReleaseClient`
   - resolves the discovered `xr-app` contract,
   - requests `/releases/latest?channel=...`,
   - downloads the package with bounded size.

3. `AndroidInteractiveInstaller`
   - verifies that the application may request package installs,
   - exposes the verified APK through a `FileProvider`,
   - launches the Android package installer,
   - therefore returns the normal `user-action-required` path.

4. `JsonUpdateStateStore`
   - persists only updater control state,
   - MUST NOT share or clear XR `outbox/`, pairing credentials or primary capture data.

## Android manifest requirements

The application needs at least:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

<application ...>
    <provider
        android:name="androidx.core.content.FileProvider"
        android:authorities="${applicationId}.updates"
        android:exported="false"
        android:grantUriPermissions="true">
        <meta-data
            android:name="android.support.FILE_PROVIDER_PATHS"
            android:resource="@xml/update_file_paths" />
    </provider>
</application>
```

and:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <files-path name="updates" path="updates/" />
</paths>
```

## Normal update UX

```text
check release
  -> download verified APK into files/updates/
  -> verify size + SHA-256
  -> inspect APK signer
  -> compare with installed app signer
  -> check canRequestPackageInstalls()
       -> false: open unknown-app-source settings
       -> true: launch ACTION_INSTALL_PACKAGE
  -> Android/PICO confirmation
  -> process restart / app relaunch
  -> verify installed versionCode
```

The application MUST keep the already installed version usable if any step before Android package installation fails.

A future managed-device adapter may replace the interactive installer with a PICO enterprise/MDM installation API, while keeping the same updater state machine and security checks.
