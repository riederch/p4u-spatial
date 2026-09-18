# P4U Spatial

![P4U Spatial](p4u_spatial/logo.png)

Open-source, vendor-neutral spatial capture and visualization system for XR headsets. The first reference implementation targets the **PICO 4 Ultra**.

P4U Spatial connects XR scanners to a Git-backed spatial knowledge repository through a bridge service. This software repository contains **no site-specific or knowledge-base data**.

## Components

- **P4U Spatial Scanner** — XR application for indoor and site mapping.
- **XR Spatial Adapter** — OpenXR-first capability abstraction with vendor fallbacks where required.
- **P4U Spatial Bridge** — pairing, device sessions, synchronization and repository abstraction.
- **P4U Spatial HA App** — Home Assistant deployment of the bridge.
- **Repository Providers** — filesystem reference backend, then Gitea and GitHub.
- **Spatial Protocol** — provider- and headset-independent repository layout and schemas.
- **Agent Interface** — optional higher-level processing of raw data into the canonical model.
- **Scanner Simulator** — deterministic development client for bridge testing without XR hardware.

## Core principles

1. Headsets never receive Gitea or GitHub credentials.
2. Pairing happens through the bridge using a short-lived QR-code flow.
3. Raw scanner data is preserved separately from normalized spatial data.
4. The canonical spatial model is independent of headset vendor, Home Assistant and Git provider.
5. OpenXR is the preferred XR portability boundary; vendor APIs are isolated behind adapters.
6. Display data is a generated projection optimized for device capabilities.
7. Headsets support offline display caching and a durable upload outbox.
8. Gitea and GitHub are first-class repository backends.
9. Site-specific data belongs in the connected data repository, never in this software repository.
10. GIS, site, building, floor, room and scanner frames are linked by explicit transformations.
11. Established standards are reused where practical instead of inventing proprietary equivalents.
12. **AI is optional. Core capture, storage, sync, geometry, registration and display must work without an AI model.**

## Implemented vertical slice

```text
scanner simulator
       |
       v
QR-style pairing + approval
       |
       v
device/session registry
       |
       v
retry-safe scan upload
       |
       v
filesystem RepositoryProvider
       |
       v
spatial/raw/scans/<scan-id>/
```

## Home Assistant repository

This repository can be added directly to the Home Assistant app/add-on store:

```text
https://github.com/riederch/p4u-spatial
```

The initial **P4U Spatial 0.0.0** app is intentionally only a Hello World bootstrap. It verifies repository discovery, image build, installation and startup before the real bridge is packaged.

See [Development](docs/development.md), [Architecture](docs/architecture.md), [Bridge API](protocol/api.md), [Standards](docs/standards.md) and [Repository layout](protocol/repository-layout.md).
