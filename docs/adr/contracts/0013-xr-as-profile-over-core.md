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
