# ADR 0013: XR Is a Profile over Core

Status: accepted

## Decision

Pairing, XR device lifecycle, scans, XR tasks, XR observations and generated display bundles belong to an XR profile over the common Core.

Pairing is a Core credential-bootstrap mechanism.

Generic canonical Spatial reads/writes use the Spatial contracts where appropriate.

## Consequences

The legacy P4U Bridge API is no longer treated as the universal protocol API.

P4U may keep `/api/v1` as a compatibility alias, while new clients discover the `xr` contract URL from Core discovery.

XR vendor/runtime identities remain bindings and evidence rather than canonical Spatial identity.

## Implementation anchors

- `protocol/xr/README.md` — XR profile boundary over Core and canonical XR scopes.
- `protocol/xr/pairing.md` — XR pairing as credential bootstrap.
- `bridge/src/server.ts` — Core principal endpoint plus legacy `/api/v1` XR compatibility surface and discovered XR contract.
- `bridge/src/domain.ts` — canonical XR scopes with legacy compatibility aliases.

## Reconciliation note

The intended Core/XR boundary is implemented. The current Bridge still uses `/api/v1` as the discovered XR href, which is explicitly allowed as a migration compatibility alias.
