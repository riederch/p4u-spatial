# ADR 0007: Authentication Boundary

Status: accepted

## Decision

Authentication belongs to the shared Core.

Contracts define their own authorization scopes and resource permissions but do not create independent user identities on the same instance.

Pairing is a credential-bootstrap mechanism.

Protected contract APIs use the Core-authenticated principal.

## Consequences

Spatial and App Sync can share one login/session when served by one instance.

Different instances still have independent principals; equal local user IDs do not imply a global identity.

Federation MUST NOT expose upstream credentials to clients.

## Implementation anchors

- `protocol/core/README.md` — Core authentication/principal boundary.
- `protocol/core/registry.md` — shared scope namespace.
- `bridge/src/server.ts` — one authenticated device principal is reused across Spatial and XR endpoints.
- `bridge/src/domain.ts` — canonical contract scopes plus legacy XR aliases.

## Reconciliation note

The Bridge uses one device/session identity across its implemented contracts. App Sync is not implemented by the reference Bridge, so shared Core authentication with App Sync is specified but not exercised here.
