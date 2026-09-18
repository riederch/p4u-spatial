# Portable Backup Format v1 - Requirements Draft

Portable backup is independent of Core, Spatial and App Sync network availability.

The target user experience is one encrypted file protected by a PIN/passphrase.

## Goals

A backup restores the non-reconstructable and intentionally retained local application state, including:

- workspace objects,
- local/imported files,
- connections,
- both application and provider outboxes,
- device-relevant state,
- user-managed offline packages where provider policy permits,
- exportable secrets where policy and credential type permit.

Transient caches are excluded.

## Secret classes

Connections classify credentials as:

- `exportable`
- `non-exportable`
- `reauth-required`

Passkeys or hardware/OS-bound private keys are typically non-exportable.

After restore the application must clearly identify connections requiring reauthentication.

## Encryption

The container MUST provide authenticated encryption and MUST derive the encryption key from the supplied PIN/passphrase using a modern password KDF.

The exact KDF, cipher suite, binary framing and file extension remain to be selected before implementation.

A short numerical PIN alone has limited resistance to offline brute force; the format must support longer passphrases even if the UI calls the value a backup PIN.

## Logical structure

```text
unencrypted header
├── format/version
├── KDF parameters
├── salt
└── encryption parameters

encrypted authenticated payload
├── manifest
├── workspace/
├── device/
├── connections/
├── outbox/
├── blobs/
├── offline-packages/
└── secrets/
```

## Account Sync relationship

Portable backup remains available whether or not the user is logged in to an Account Provider.

Account Sync is automatic, lightweight and multi-device.

Portable backup targets full device recovery and may therefore contain intentionally downloaded offline packages that Account Sync does not replicate.
