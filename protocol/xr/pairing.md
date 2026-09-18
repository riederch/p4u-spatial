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
