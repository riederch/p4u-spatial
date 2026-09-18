# Core Contract v0.1

Core is the common contract for all network-facing protocol modules.

It defines:

- instance identity,
- contract discovery,
- authentication boundary,
- principal identity,
- authorization scopes,
- capabilities,
- device context,
- versioning,
- common errors.

It does not define spatial data, workspace data, backup content or XR capture.

## Discovery and endpoints

The draft protocol family uses the machine identifier `open-spatial-interop`.

Initial mandatory Core endpoints:

```http
GET /.well-known/open-spatial-interop
GET /core/v1/me
```

See [registry.md](registry.md) for canonical contract, capability and scope names.

Contract base URLs are returned by discovery and MUST NOT be inferred from one another.

## Identity

A concrete server installation has a stable `instanceId`.

A principal is globally identified by:

```text
(instanceId, principalId)
```

Equal `principalId` values on different instances MUST NOT be assumed to represent the same person/service/device.

Protocol-generated global technical identifiers SHOULD use UUIDv7 where practical. Provider-native identifiers may remain opaque strings.

## Authentication

Authentication belongs to Core and is shared by all contracts exposed by the same instance.

Protected APIs use bearer credentials after credential bootstrap:

```http
Authorization: Bearer <access-token>
```

The method used to acquire the credential is separate from the API contract. OAuth/OIDC, passkeys, username/password login or XR QR pairing may be used by an implementation.

XR pairing is a credential bootstrap flow, not a separate Spatial authentication model.

A server implementing OAuth protected-resource metadata SHOULD advertise the corresponding metadata URI from discovery.

## Principal endpoint

```http
GET /core/v1/me
```

returns the authenticated Core principal and effective top-level scopes.

Device-authenticated sessions may use a device/service principal and include `deviceContext.deviceId`.

The same credential used with multiple contracts on one instance resolves to the same Core principal identity.

## Capabilities, scopes and permissions

These are different concepts:

- capability: what an implementation or route technically supports,
- scope: what an authenticated principal may generally do,
- resource permission: what is permitted for the specific resource.

Effective permission is the intersection of implementation capability, route capability, principal scope and resource permission.

## Contract independence

An instance may validly expose only:

```text
Core + Spatial
```

or only:

```text
Core + App Sync
```

No contract may infer another contract's URL. All URLs are obtained from discovery.

## Errors

All contracts use the common error envelope:

```json
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "The authenticated principal may not access this resource.",
    "requestId": "req-123"
  }
}
```

`requestId` is an opaque correlation identifier, not a protocol entity ID.

Common error codes include:

- INVALID_REQUEST
- UNSUPPORTED_VERSION
- AUTH_REQUIRED
- TOKEN_INVALID
- TOKEN_EXPIRED
- ACCESS_DENIED
- SCOPE_REQUIRED
- CAPABILITY_REQUIRED
- RESOURCE_NOT_FOUND
- METHOD_NOT_ALLOWED
- PAYLOAD_TOO_LARGE
- RATE_LIMITED
- INTERNAL_ERROR
- SERVICE_UNAVAILABLE

## Security

Normal responses MUST NOT expose passwords, upstream refresh tokens, private device keys, Git provider credentials or equivalent secrets.

Upstream credentials held by a federation provider MUST NOT be returned to clients.
