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
