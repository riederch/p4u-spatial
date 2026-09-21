# ADR 0017: Discovery Identifier and Machine Namespace Registry

Status: accepted

## Decision

The draft protocol family keeps the human-readable name **Open Interoperability Protocol** and uses the machine discovery identifier:

```text
open-spatial-interop
```

Discovery is served at:

```text
/.well-known/open-spatial-interop
```

Canonical contract keys are lower-case kebab-case.

Capabilities and scopes use contract-prefixed dot namespaces such as:

```text
spatial.read
spatial.artifacts.read
federation.durable-relay
app-sync.write
xr.scan.write
```

## Consequences

Implementations have one deterministic discovery location during the draft v0.1 period.

App Sync remains semantically independent of Spatial despite participating in the same interoperability family.

The machine identifier is not tied to P4U/PICO and can survive later extraction of the protocol into a separate repository.

Legacy P4U XR scopes remain accepted as compatibility aliases but are not canonical protocol names.

## Implementation anchors

- `protocol/core/registry.md` — canonical discovery identifier, contract keys, capability and scope namespaces.
- `bridge/src/server.ts` — serves `/.well-known/open-spatial-interop` and publishes canonical Core/Spatial/Federation/XR capabilities.
- `bridge/src/domain.ts` — canonical dot-namespaced device scopes and legacy XR aliases.

## Reconciliation note

One unresolved inconsistency remains: discovery currently advertises an additional `xr-app` contract and `protocol/xr/app-lifecycle.md` documents that key, while the registry lists canonical contract keys as `core`, `spatial`, `tiles`, `federation`, `app-sync`, `xr`. This audit does not silently choose one interpretation; it must be resolved by an explicit follow-up ADR or registry amendment.
