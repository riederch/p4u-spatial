# Open Interoperability Protocol

Status: draft / incubating in p4u-spatial.

This directory defines implementation-neutral contracts shared by P4U Spatial, MultiGIS and compatible third-party or private implementations. The contracts are intentionally independent of PICO, Home Assistant, Fire, RCHKB, Gitea and GitHub.

The draft machine discovery identifier is:

```text
open-spatial-interop
```

Discovery:

```http
GET /.well-known/open-spatial-interop
```

The human-readable family name remains **Open Interoperability Protocol**. The machine identifier is a technical draft identifier, not a product brand.

## Contract layers

```text
Core
├── identity / discovery / auth / capabilities / errors
│
├── Spatial
│   └── Sources / Routes / Collections / Features / Relations / Artifacts / Snapshots
│
├── Tiles
│   └── Tile Sets / Offline Plans
│
├── App Sync
│   └── Workspace / Changes / Blobs / Devices / History
│
├── Federation
│   └── Routing / Cache / Durable Relay
│
└── XR
    └── Pairing / Scan / Observation / Task profiles
```

Portable backup is a local file format, not a network contract.

Publish is a client workflow between application-owned state and Spatial authority, not a separate storage service.

## Core invariants

1. Core, Spatial and App Sync are implementation-neutral.
2. Spatial and App Sync depend on Core but do not depend on each other.
3. A spatial object has exactly one authoritative source.
4. A route is a transport path and never a data authority.
5. Federation preserves upstream `sourceId`.
6. Multiple routes with the same `sourceId` represent one source.
7. Caches are not canonical.
8. Offline write operations remain durable until acknowledged.
9. Provider data is not replicated into an Account Provider as a second authority.
10. Repository layouts are backend profiles, not protocol requirements.
11. XR-specific behavior is an extension of the common contracts, not the common core itself.
12. App Sync storage does not implicitly publish data into Spatial.
13. Cross-source relations own assertions, not their endpoint objects.
14. Committed Spatial Artifacts are immutable.

## Canonical machine namespaces

See [Core Registry](core/registry.md).

Contract identifiers:

```text
core
spatial
tiles
federation
app-sync
xr
```

## Current target topology

```text
                  Account Provider
                 /                \
          MultiGIS A            MultiGIS B
             |                     |
             +------ Spatial ------+
                    /       \
             Fire Provider   HA Federation
                                |
                                +-- RCHKB adapter
                                +-- other providers

XR Client --------------------> HA Federation
```

A dedicated MultiGIS backend may implement Core + App Sync only. A domain-specific Fire instance such as a WWG deployment may implement Core + Spatial only.

## Versioning

The contracts are pre-1.0 drafts. Breaking changes are expected while the first independent implementations are built and tested.
