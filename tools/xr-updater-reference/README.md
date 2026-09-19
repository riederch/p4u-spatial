# XR updater reference

This workspace is the platform-neutral reference state machine for the PICO/Android application updater.

It deliberately does not implement Android package APIs. A concrete PICO client supplies adapters for:

- querying/downloading from the discovered `xr-app` contract,
- reading the installed package version and signing certificate,
- extracting/verifying the downloaded APK signing certificate,
- durable update-state storage,
- Android/PICO package installation.

The reference flow is:

```text
check
  -> available
  -> download
  -> verify size + SHA-256
  -> verify release signer + installed signer
  -> ready-to-install
  -> Android/PICO installer
  -> awaiting-restart
  -> verify installed versionCode
  -> complete
```

The updater state is independent from the XR client's `outbox/`, `cache/`, pairing credentials and device identity. A concrete client must therefore never clear those stores as part of an update.

`user-action-required` is a normal installer outcome. It means the verified APK is ready but Android/PICO requires confirmation or device-management intervention.
