# Review closeout — 2026-09-19

This document closes the pre-practical-test repository review. Every review item is either implemented or explicitly recorded here as requiring real hardware or later product UX validation.

## Resolved

- Bridge TypeScript build/type errors and WebAuthn persistence typing.
- Android SDK CI and PICO release workflow setup.
- Shared Kotlin updater source-set wiring and AndroidX/API-36 compatibility.
- Automatic CI for pull requests and `main`.
- Host tests for administrator users, device assignment, pairing claims and administrator authentication.
- QR pairing wired into the PICO Android client.
- Secure per-Bridge session persistence.
- Synthetic practical-test scan through durable outbox and authenticated upload.
- Pending pairing-claim administration and pairing expiry during polling.
- Local-first/public-fallback Bridge endpoint resolution with `instanceId` validation.
- Debug-only LAN cleartext HTTP; release builds remain cleartext-disabled.
- Administrator users with stable `userId`.
- Multiple passkeys per administrator, bound to that user.
- Independent passkey login and username + password + TOTP login; password-only login is prohibited.
- Shared user-bound administrator sessions with Secure/HttpOnly cookie and CSRF protection.
- First-run administrator setup using a one-time Bridge-generated proof.
- Persistent Bridge-owned operator configuration and Home Assistant deployment parity.
- Home Assistant functional options removed (`options: {}`, `schema: {}`).
- Gradle wrapper committed for the PICO project.
- npm `package-lock.json` committed for reproducible Node dependency resolution.

## Intentionally pending — hardware validation

The following items MUST remain pending until exercised on real target hardware:

- install/sideload on a PICO 4 Ultra;
- QR pairing on the headset;
- local/public Bridge address switching on real networks;
- session refresh and outbox recovery after app/device restart;
- APK update install and restart verification on the PICO;
- OpenXR runtime capability probing;
- real scene, mesh, anchor and tracking capture;
- long-running capture plus crash, power-loss and recovery tests.

CI, a synthetic scan or a successful APK build are not accepted as hardware validation.

## Intentionally pending — product UX

- production MR/OpenXR capture UI;
- full administrator GUI for managing multiple users;
- full administrator GUI for assigning/unassigning devices to users;
- richer offline/retry UX and display cache.

The backing API/data-model primitives for multiple users and optional device `assignedUserId` already exist.
