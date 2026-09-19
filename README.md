# P4U Spatial

![P4U Spatial](p4u_spatial/logo.png)

Open-source, vendor-neutral spatial capture and visualization system for XR headsets. The first reference implementation targets the **PICO 4 Ultra**.

P4U Spatial connects XR scanners to a Git-backed spatial knowledge repository through a bridge service. This software repository contains **no site-specific or knowledge-base data**.

## Components

- **P4U Spatial Scanner** — XR application for indoor and site mapping.
- **XR Spatial Adapter** — OpenXR-first capability abstraction with vendor fallbacks where required.
- **P4U Spatial Bridge** — pairing, device sessions, synchronization and repository abstraction.
- **P4U Spatial HA App** — Home Assistant deployment of the bridge.
- **Repository Providers** — filesystem reference backend plus a generic Git remote backend for GitHub and Gitea.
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

## Implemented reference slices

The bridge currently includes:

- Core discovery, device pairing and device/session management,
- Spatial Read with stable source identity and immutable snapshots,
- Spatial Write with persistent source-wide idempotency and revision conflicts,
- filesystem and generic Git remote repository providers,
- GitHub/Gitea-backed repository operation without exposing repository credentials to XR clients,
- Federation source discovery, read cache provenance and durable write relay,
- retry-safe XR scan and observation persistence.

The protocol contracts remain independent from these reference storage/deployment choices.

## Home Assistant repository

This repository can be added directly to the Home Assistant app/add-on store:

```text
https://github.com/riederch/p4u-spatial
```

The currently published Home Assistant app is **P4U Spatial 0.0.2**. Normal development on `main` does not publish a new image; releases are deliberately advanced through `ha-release`.

See [Development](docs/development.md), [Architecture](docs/architecture.md), [Bridge API](protocol/api.md), [Standards](docs/standards.md) and [Repository layout](protocol/repository-layout.md).
