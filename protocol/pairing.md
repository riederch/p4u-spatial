# Device Pairing and Session Protocol

## Goals

- no Git-provider credentials on the headset,
- one-time QR bootstrap,
- explicit human approval in the bridge/add-on UI,
- revocable device authorization,
- usable with PICO, Meta and future XR clients.

## Device states

- `pending-pairing`
- `authorized`
- `disabled`
- `revoked`

`disabled` is reversible. `revoked` invalidates the authorization permanently; reconnecting requires a new pairing.

## 1. Create pairing

The bridge/add-on creates:

- cryptographically random `pairingId`,
- cryptographically random one-time `secret`,
- expiry time, normally no more than 5 minutes.

The QR code contains only the pairing bootstrap payload. It never contains repository credentials.

Example:

```json
{
  "version": 1,
  "bridge": "https://spatial.example.local",
  "pairingId": "019...",
  "secret": "...",
  "expiresAt": "2026-09-18T13:00:00Z"
}
```

## 2. Claim from headset

The headset generates its local device identity information and calls:

`POST /api/v1/pairing/claim`

with:

- pairing ID,
- one-time secret,
- device descriptor,
- requested capabilities metadata,
- optional device public key for future proof-of-possession support.

The bridge consumes the secret at first valid claim and returns a `claimId`.

## 3. Human approval

The add-on UI shows the pending device and allows:

- authorize,
- reject.

The headset polls:

`GET /api/v1/pairing/claims/{claimId}`

until one of:

- `pending`
- `authorized`
- `rejected`
- `expired`

On authorization, the response returns one-time session bootstrap material.

## 4. Sessions

V1 uses:

- short-lived access token,
- longer-lived refresh credential stored in platform secure storage.

The refresh credential is bound to the device authorization and is invalid after disable/revoke according to policy.

A later protocol revision may require asymmetric proof-of-possession without changing repository-provider credentials or spatial data formats.

## 5. Revocation

On revoke the bridge must:

1. change device state to `revoked`,
2. invalidate all active access sessions,
3. invalidate refresh credentials,
4. reject every subsequent API request from the old authorization.

The client clears bridge credentials and returns to the pairing UI after receiving `DEVICE_REVOKED`.

## QR security

The pairing secret:

- must have at least 128 bits of cryptographic entropy,
- is single-use,
- expires quickly,
- is never logged in plaintext,
- is never persisted in repository data.

The bridge URL is not itself a credential.
