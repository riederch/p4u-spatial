# P4U Spatial

Open-source spatial capture and visualization system for the **PICO 4 Ultra**.

P4U Spatial connects a PICO 4 Ultra scanner to a Git-backed spatial knowledge repository through a bridge service. This software repository contains **no site-specific or knowledge-base data**.

## Components

- **P4U Spatial Scanner** — PICO 4 Ultra application for indoor and site mapping.
- **P4U Spatial Bridge** — pairing, device sessions, synchronization and repository abstraction.
- **P4U Spatial HA Add-on** — Home Assistant deployment of the bridge.
- **Repository Providers** — Gitea and GitHub.
- **Spatial Protocol** — provider-independent repository layout and schemas.
- **Agent Interface** — raw-data-to-model processing contract.

## Core principles

1. The headset never receives Gitea or GitHub credentials.
2. Pairing happens through the bridge using a short-lived QR-code flow.
3. Raw scanner data is preserved separately from normalized spatial data.
4. The canonical spatial model is independent of PICO, Home Assistant and the Git provider.
5. Display data is a generated projection optimized for the headset.
6. The headset supports offline display caching and a durable upload outbox.
7. Gitea and GitHub are first-class repository backends.
8. Site-specific data belongs in the connected data repository, never in this software repository.
9. Natural and artificial landmarks may be used for spatial registration and drift correction.
10. GIS, building, floor and room coordinate frames are linked by explicit transformations.

## Data layers

```text
spatial/
├── raw/       # scanner uploads and observations
├── model/     # canonical provider-independent spatial model
└── display/   # generated device-specific projections
```

See [docs/architecture.md](docs/architecture.md) and [protocol/repository-layout.md](protocol/repository-layout.md).

## Status

Early architecture and protocol definition.
