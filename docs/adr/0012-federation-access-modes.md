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

Future OAuth/OIDC delegation can be added without changing source identity or Spatial operation semantics.
