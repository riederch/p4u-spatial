# Federation Contract v0.1

Dependencies: Core v0.1 and Spatial.

Federation exposes upstream Spatial Sources through another protocol instance without transferring authority to the federation provider.

## Authority

A federation provider is a route, cache and optional durable relay.

It is not the authority for an upstream source.

It MUST preserve:

- upstream `sourceId`,
- target `objectId`,
- Spatial `operationId` when forwarding writes.

It MUST NOT silently mint a replacement source identity for an upstream protocol source.

## Access modes

A federated route describes how the federation provider reaches the upstream source.

Initial modes:

- `anonymous`
- `service`
- `delegated-user`

### anonymous

The upstream source requires no user-specific credentials.

### service

The federation provider owns a service credential.

The client authenticates only to the federation provider.

The effective upstream rights are the rights of that service identity and may be smaller than the client's direct rights.

### delegated-user

The federation provider operates with explicitly delegated user authorization.

Passwords MUST NOT be handed to the federation provider as a generic delegation mechanism. OAuth/OIDC-style delegation is the intended model where supported.

Full delegated-user flow is optional in v0.1; the access mode is reserved so implementations do not confuse it with service access.

## Read federation

A federation provider may proxy live responses and/or expose a cache.

It MUST describe delivery provenance and MUST NOT represent an unvalidated cached response as live.

Cached data remains associated with the upstream source ID and the access view used to obtain it.

## Durable relay

A route may advertise:

```text
federation.durable-relay
```

Only such a route may return operation state `relay-durable`.

Before returning `relay-durable`, the relay MUST durably persist:

- the full logical operation,
- its `sourceId`,
- its `operationId`,
- enough authorization/routing context to continue or explicitly fail delivery,
- current relay status.

The persisted operation MUST survive process restart.

## Forwarding

When forwarding a Spatial operation upstream, the relay MUST preserve the original:

```text
sourceId
operationId
action
target
baseRevision
payload
```

Transport metadata may be added outside the logical operation.

A relay MUST NOT rewrite an operation to avoid an upstream conflict.

## Final status

The relay retains responsibility until one of:

- `source-committed`
- `conflict`
- `rejected`

The relay MUST expose the current status through its Spatial operation-status endpoint.

It MUST NOT report `source-committed` until the authoritative source has provided a definitive successful result.

## Retry and backoff

Temporary upstream failure does not turn a durable operation into `rejected`.

The relay retains the operation and retries according to implementation policy.

Clients do not need to resubmit a `relay-durable` operation merely because the upstream source is offline.

## Route capability

Capabilities are route-specific.

A federation provider MUST advertise only operations it can actually carry for the current principal/access mode.

A read-only service credential therefore produces a read-only federated route even when another direct route to the source permits writes.

## Credentials

The federation provider MUST NOT expose upstream credentials, refresh tokens or private keys to the client.

For service access, those credentials remain exclusively in the federation provider's secure storage.

## Cache and relay independence

A provider may support:

- federation read without cache,
- federation read with cache,
- federation read + durable relay,
- other capability combinations.

Durable relay is not implied by caching.

## v0.1 exclusions

- automatic cross-instance identity linking,
- generic password forwarding,
- distributed transactions across multiple sources,
- automatic conflict merge,
- changing authoritative source during relay,
- federation provider becoming authority merely because it has a cached copy.
