# ADR 0012: Federation Access Modes

Status: accepted

## Decision

Federated routes explicitly describe upstream access as one of:

- anonymous,
- service,
- delegated-user.

Service access uses credentials owned by the federation provider and does not inherit the client's rights on a separate direct route.

Delegated-user access is distinct from generic password forwarding.

## Consequences

Route capabilities and permissions may differ for the same source.

A direct writable source can legitimately have a read-only HA route.

Federation providers never expose their upstream service credentials to clients.

OAuth/OIDC delegation is concretized by ADR 0028 without changing source identity or Spatial operation semantics.

## Implementation anchors

- `protocol/federation/http.md` — route-effective federation behavior and no credential pass-through.
- `protocol/schemas/spatial/route.schema.json` — route access-mode metadata.
- `bridge/src/services/federation-service.ts` — anonymous, service and delegated-user route behavior with provider-owned credentials.
- `bridge/src/services/federation-delegation-service.ts` — delegated-user OAuth credential lifecycle defined by ADR 0028.

## Reconciliation note

The reference Bridge implements all three access modes. `delegated-user` supports the two
route-declared methods defined by ADR 0028: Authorization Code + PKCE and Token Exchange.

## Related decisions

- ADR 0028: Delegated-User Federation Supports PKCE and Token Exchange
