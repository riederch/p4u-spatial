# ADR 0027: Separate XR Application Lifecycle Contract and Discovery Registry

Status: Accepted

Date: 2026-09-21

Supersedes: ADR 0005, ADR 0017

## Context

The protocol family already exposes application update/distribution behavior separately from XR
pairing, scan, observation and task APIs.

During the 2026-09-21 ADR/code reconciliation, the repository contained two competing models:

- the registry listed only `xr` as the XR-related contract,
- discovery and `protocol/xr/app-lifecycle.md` exposed a separate `xr-app` contract.

The historical reason for the divergence is no longer recorded. The architecture decision was
therefore made explicitly on 2026-09-21: XR application lifecycle remains a separate contract.

## Decision

The Open Interoperability Protocol family consists of a shared Core and independent contracts for:

- `spatial`
- `tiles`
- `federation`
- `app-sync`
- `xr`
- `xr-app`

`xr-app` is a first-class, independently discoverable contract. It is not a sub-path or implicit
capability of the `xr` contract.

### Discovery

The protocol family keeps the implementation-neutral machine identifier:

```text
open-spatial-interop
```

Discovery remains:

```text
/.well-known/open-spatial-interop
```

Canonical contract keys are lower-case kebab-case. The canonical contract key for application
distribution/update is:

```text
xr-app
```

A typical discovery fragment is:

```json
{
  "contracts": {
    "xr": {
      "version": "0.1",
      "href": "https://spatial.example/api/v1"
    },
    "xr-app": {
      "version": "0.1",
      "href": "https://spatial.example/xr-app/v1"
    }
  }
}
```

### Contract boundaries

`xr` owns runtime/device interaction such as pairing, device lifecycle, display, scan,
observation and task workflows.

`xr-app` owns application release discovery, release metadata, package retrieval and application
update lifecycle.

Application versioning remains independent from XR/Core/Spatial protocol versions. A deployment may
implement `xr` without `xr-app`, or `xr-app` without exposing every XR runtime capability.

### Capability namespace

Capabilities use the owning contract key as their namespace.

The canonical application-update capability is:

```text
xr-app.update
```

`xr.app.update` is not canonical after this decision.

### Existing layering invariants

Spatial and App Sync remain independent sibling contracts over Core.

Portable backup remains a local format rather than a network contract.

Capabilities and scopes continue to use contract-prefixed namespaces. Legacy P4U XR scope aliases
remain compatibility aliases only.

## Consequences

- XR runtime protocol and application distribution can evolve/version independently.
- Clients can discover update support without inferring it from the `xr` contract.
- Implementations that do not distribute applications do not need to expose `xr-app`.
- Registry, discovery, tests and documentation must use `xr-app.update` for update capability
  advertisement.
- ADR 0005 and ADR 0017 remain in the repository for history but are superseded by this decision.

## Implementation anchors

- `protocol/README.md` — contract dependency map including independent XR and XR App contracts.
- `protocol/core/registry.md` — canonical `xr-app` contract key and `xr-app.update` capability.
- `protocol/xr/app-lifecycle.md` — normative XR application lifecycle contract.
- `bridge/src/server.ts` — discovery advertises distinct `xr` and `xr-app` contracts.
- `bridge/test/xr-app-release.test.ts` — verifies separate discovery and canonical capability.

## Related decisions

- ADR 0013: XR Is a Profile over Core
- ADR 0023: XR Application Update Trust and Release Lifecycle
