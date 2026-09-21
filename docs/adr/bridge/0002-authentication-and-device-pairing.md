# ADR 0002: Authentication and device pairing

Status: Accepted

## Decision

New PICO 4 Ultra devices are paired from the bridge/add-on UI using a short-lived, one-time QR code.

The QR payload contains only bridge location and temporary pairing material. It must not contain Git credentials or long-lived repository secrets.

After approval, the bridge creates a device identity and issues bridge-scoped credentials/sessions.

## Device lifecycle

- paired
- authorized
- disabled
- revoked

Revocation invalidates active sessions and refresh capability immediately. Re-pairing after revocation creates a new authorization.

## Security rules

- repository credentials remain on the bridge,
- access tokens are short-lived,
- durable secrets are stored using secure platform storage,
- device scopes follow least privilege,
- all requests check both session validity and current device authorization state.

## Implementation anchors

- `bridge/src/services/pairing-service.ts` — short-lived one-time pairing secrets and claim lifecycle.
- `bridge/src/services/device-registry.ts` — authorized/disabled/revoked device lifecycle and scope state.
- `bridge/src/services/session-service.ts` — short-lived access tokens, refresh rotation and device-wide revocation.
- `bridge/src/server.ts` — administrator approval/rejection, pairing claim endpoints and immediate session revocation on device revoke.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/PairingClient.kt` — headset pairing/bootstrap client.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/SecureSessionStore.kt` — refresh credentials are protected with Android Keystore-backed encryption.
