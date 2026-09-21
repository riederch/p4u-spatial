# Federation HTTP v0.1

Federation deliberately reuses the normal Spatial surface.

There is no separate duplicate feature API.

## Source discovery

Federated sources are returned through:

```http
GET /spatial/v1/sources
```

Their source descriptor contains a route with:

```text
kind = federated
upstreamInstanceId
accessMode
```

For `accessMode = delegated-user`, the route additionally declares:

```text
delegation.method = authorization-code-pkce | token-exchange
```

and route-effective capabilities.

## Reads

Reads use the normal Spatial Read links.

Delivery metadata identifies whether the response/view is live or cached.

## Writes

Writes use:

```http
POST /spatial/v1/operations
GET  /spatial/v1/operations/{operationId}
```

The federation provider may return `relay-durable` only if the route advertises `federation.durable-relay`.

## Delegated-user authorization

Delegated-user federation uses one of two route-declared methods:

- `authorization-code-pkce`
- `token-exchange`

The method changes only how the federation provider obtains a user-specific upstream credential. It
does not change source identity or Spatial read/write semantics.

For Authorization Code + PKCE, the reference control surface is:

```http
GET    /federation/v1/authorization/status
POST   /federation/v1/authorization/start
GET    /federation/v1/authorization/callback
DELETE /federation/v1/authorization
```

`start` returns an authorization URL. The callback is protected by an opaque, expiring, single-use
OAuth state and PKCE S256 verifier/challenge pair.

For Token Exchange, the reference control surface additionally supports:

```http
POST /federation/v1/authorization/establish
```

The provider performs RFC 8693 style token exchange using a deployment-specific subject-token
provider. The Federation contract does not define or transport a P4U-specific subject token.

Delegated credentials are server-side and scoped to `(routeId, localUserId)`. Delegated source/read
caches are likewise local-user scoped. Relay retries preserve the delegated user that originally
accepted durable relay responsibility.

## No credential pass-through endpoint

v0.1 defines no endpoint that returns or transports raw upstream passwords, access tokens, refresh
tokens or subject tokens to clients. Authorization endpoints expose only state/status and navigation
metadata.
