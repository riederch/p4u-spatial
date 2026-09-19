# XR Device Pairing v0.1

Dependency: Core v0.1.

Pairing is a credential-bootstrap mechanism for an XR device. It does not create a separate spatial identity system.

## Goals

- no Git-provider or upstream federation credentials on the headset,
- one-time QR bootstrap,
- explicit human approval,
- revocable device authorization,
- vendor-neutral XR clients,
- resulting credentials authenticate a Core principal/device.

## Device states

XR management may expose:

- `pending-pairing`
- `authorized`
- `disabled`
- `revoked`

`disabled` is reversible.

`revoked` permanently invalidates the current authorization. Reconnection requires a new pairing.

## Create pairing

The bridge/add-on creates:

- cryptographically random `pairingId`,
- cryptographically random one-time `secret`,
- short expiry, normally no more than five minutes.

Example QR payload:

```json
{
  "version": 1,
  "bridge": "https://spatial.example.local",
  "pairingId": "019...",
  "secret": "...",
  "expiresAt": "2026-09-18T13:00:00Z"
}
```

The QR payload MUST NOT contain repository credentials or federation upstream credentials.

## Claim

Relative to the discovered XR contract URL:

```http
POST /pairing/claim
```

The device submits:

- pairing ID,
- one-time secret,
- device descriptor,
- runtime capabilities,
- optional device public key.

The secret is consumed at first valid claim.

The response contains a `claimId`.

## Approval

The management UI exposes the pending device for explicit approval/rejection.

The XR client polls:

```http
GET /pairing/claims/{claimId}
```

States:

- `pending`
- `authorized`
- `rejected`
- `expired`

On authorization, the bridge returns one-time bootstrap material from which the client receives Core-compatible bearer/session credentials.

## Session

The reference profile supports:

- short-lived access token,
- longer-lived refresh credential stored in secure platform storage.

Refresh credentials belong to the bridge/Core trust domain and are never Git-provider credentials.

A future revision may use asymmetric proof-of-possession without changing repository or Spatial identities.

## Revocation

Revocation MUST:

1. mark current device authorization revoked,
2. invalidate active access sessions,
3. invalidate refresh credentials,
4. reject later requests from the revoked authorization.

An offline device cannot be remotely erased. Revocation becomes enforceable at its next interaction with the instance.

## QR security

The pairing secret:

- MUST contain at least 128 bits of cryptographic entropy,
- MUST be single-use,
- MUST expire quickly,
- MUST NOT be logged in plaintext,
- MUST NOT be persisted in repository data.

The bridge URL is not itself a credential.

## Client persistence and recovery

The reference durable client state model is defined in [client-state.md](client-state.md).

The device ID persists across normal application updates. The one-time pairing secret is discarded immediately after a successful claim. Access tokens may remain memory-only; refresh credentials are stored using OS-backed secure storage. Losing or revoking a session MUST NOT delete pending capture outbox data.


## Human-readable names

Opaque instance and device IDs remain the stable technical identities. User interfaces SHOULD prefer human-readable names.

Two naming scopes are intentionally distinct:

- **local Bridge name** — an alias stored only on a particular XR client for a Bridge profile;
- **global Bridge name** — the Bridge instance name published by discovery and shared by all clients of that instance;
- **local device name** — the headset name configured on the XR client and submitted as part of its device descriptor;
- **global device name** — the administrative name assigned to that device by a Bridge.

A local name does not change identity and MAY differ between clients. A global name does not replace `instanceId` or `deviceId`.

Discovery MAY expose `instanceName` beside `instanceId`. The reference Bridge persists this name with its instance identity.

The reference management API provides:

```http
PUT /api/v1/admin/instance/name
PUT /api/v1/admin/devices/{deviceId}/name
```

When presenting a device, a Bridge SHOULD prefer the global device name, then the device-provided local name, then a platform/model fallback. Renaming MUST NOT invalidate pairing, sessions, pending outbox data or canonical identifiers.
