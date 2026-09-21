# ADR 0028: Delegated-User Federation Supports PKCE and Token Exchange

Status: Accepted

Date: 2026-09-21

## Context

ADR 0012 established `delegated-user` as a federation access mode but intentionally did not define
how the federation provider obtains an upstream credential for the local user.

The reference Bridge now needs a provider-independent model that supports both interactive OAuth
authorization and deployments with an established cross-provider token-exchange trust relationship.

A delegated route also cannot safely reuse one global source/read cache because route-effective
authorization may differ by local user.

## Decision

`delegated-user` remains one federation access mode. Each delegated route additionally declares
exactly one delegation method:

- `authorization-code-pkce`
- `token-exchange`

The common federation semantics are independent of the selected method.

### Common delegated-user semantics

- Upstream credentials are owned by the federation provider and are never returned to XR/Spatial
  clients.
- Credentials are stored server-side per `(routeId, localUserId)`.
- The device must resolve to a local user before a delegated route can be used.
- Source/read caches are partitioned by local user for delegated routes.
- Persisted relay responsibility records the local delegated user so retries use the same authority.
- Disabling/revoking local access or delegated credentials must not silently fall back to a service
  credential.
- Raw upstream passwords are never forwarded through the Spatial/Federation contracts.

### Authorization Code + PKCE

For `authorization-code-pkce` the Bridge acts as the OAuth client.

The Bridge:

1. creates a cryptographically random OAuth `state` and PKCE verifier,
2. sends the browser/user to the configured authorization endpoint with an S256 challenge,
3. receives the callback,
4. exchanges the authorization code at the token endpoint,
5. stores the resulting access/refresh credential only on the Bridge,
6. refreshes the access token server-side when required.

The authorization callback is bound to the pending local user and route through the opaque
single-use state value.

### Token Exchange

For `token-exchange` the Bridge uses RFC 8693 style token exchange against the configured token
endpoint.

The contract does not prescribe the local subject-token format. A deployment-specific
`SubjectTokenProvider` supplies a short-lived subject token representing the local user and its
token type.

This avoids inventing a P4U-specific federation identity token and allows deployments to use an
OIDC broker, workload identity, signed local assertion or another explicitly trusted mechanism.

The exchanged upstream token remains server-side and may be cached until expiry.

### Route metadata

A federated route with `accessMode = delegated-user` includes:

```json
{
  "accessMode": "delegated-user",
  "delegation": {
    "method": "authorization-code-pkce"
  }
}
```

or:

```json
{
  "accessMode": "delegated-user",
  "delegation": {
    "method": "token-exchange"
  }
}
```

### Authorization control surface

Spatial object/source APIs remain unchanged.

The reference Bridge exposes a separate federation authorization control surface for:

- current delegated authorization status,
- beginning interactive PKCE authorization,
- completing the OAuth callback,
- revoking the locally stored delegated credential.

The control surface never returns an upstream access or refresh token.

## Consequences

- Federation source identity and Spatial operation semantics remain unchanged.
- OAuth provider specifics do not leak into Spatial object contracts.
- Deployments can choose interactive PKCE or pre-established token-exchange trust per route.
- Delegated caches and retry state must be principal-aware.
- Token Exchange requires a deployment adapter capable of producing a trusted subject token; the
  generic protocol does not manufacture one.
- A route configured for one method does not silently fall back to the other method or to service
  access.

## Implementation anchors

- `protocol/federation/http.md` — delegated-user method and authorization semantics.
- `protocol/schemas/spatial/route.schema.json` — delegated route method metadata.
- `bridge/src/services/federation-delegation-service.ts` — PKCE, refresh and token-exchange
  credential lifecycle.
- `bridge/src/services/federation-service.ts` — per-user cache/relay partitioning and delegated
  credential use.
- `bridge/src/server.ts` — local-user binding and federation authorization control endpoints.

## Related decisions

- ADR 0007: Authentication Boundary
- ADR 0009: Durable Relay
- ADR 0012: Federation Access Modes
