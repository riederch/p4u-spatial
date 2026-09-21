# ADR 0001: System boundaries

Status: Accepted

## Decision

P4U Spatial is a public, generic software project. Site-specific knowledge remains in an external data repository.

The headset communicates only with the P4U Spatial Bridge. Repository access is performed by the bridge through interchangeable Gitea and GitHub providers.

## Consequences

- no repository credentials on the headset,
- no RCHKB-specific paths in application code,
- the bridge is the authorization boundary,
- the same bridge runs standalone or as a Home Assistant add-on,
- scanner, model and repository provider can evolve independently.

## Implementation anchors

- `bridge/src/repository/provider.ts` — repository access is isolated behind the Bridge-owned provider interface.
- `bridge/src/repository/factory.ts` — filesystem/Git repository selection happens only on the Bridge.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/BridgeProfileStore.kt` — the headset stores Bridge endpoints, not repository credentials or repository-provider configuration.
