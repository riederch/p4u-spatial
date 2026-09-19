# XR Profile v0.1

Dependencies: Core v0.1. Spatial is optional but recommended for shared spatial data access.

The XR profile contains device- and capture-specific behavior that is not part of the general Core or Spatial contracts.

It covers:

- QR pairing bootstrap,
- XR device descriptor and runtime capabilities,
- scan upload,
- XR tasks,
- capture observations,
- optional generated display bundles,
- signed application release/update lifecycle.

## Boundary

XR clients authenticate as Core principals/devices after pairing.

The XR profile MUST NOT define a second independent identity system for the same instance.

Generic spatial reads and writes SHOULD use the Spatial contracts where they fit.

XR endpoints remain appropriate for XR-specific primary evidence such as scene scans, runtime metadata, task interaction and generated display bundles.

## Discovery

A supporting instance advertises an `xr` contract through Core discovery:

```json
{
  "contracts": {
    "xr": {
      "version": "0.1",
      "href": "https://spatial.example/xr/v1"
    }
  }
}
```

Clients MUST use the discovered URL rather than assume a fixed path.

The P4U reference bridge may keep `/api/v1` as a compatibility alias during migration.

## Canonical scopes

Initial XR scopes:

- `xr.display.read`
- `xr.scan.write`
- `xr.observation.write`
- `xr.task.read`
- `xr.task.answer`

Older P4U scope names such as `scan:write` are legacy aliases and are not the canonical open-contract names.

## Spatial integration

If an XR action targets an existing Spatial Source object, the object is referenced by:

```text
(sourceId, objectId)
```

An XR implementation MUST NOT replace that identity with a vendor anchor ID.

Vendor anchor/scene IDs remain bindings or evidence.

For a normal canonical feature mutation, Spatial Write is preferred.

For raw scan/capture evidence whose lifecycle is XR-specific, the XR upload API remains appropriate.

## Capture package

Raw scanner evidence, coordinate frames, meshes, runtime anchors and promotion into canonical Spatial data are defined in [capture-package.md](capture-package.md).

## Derived candidates and review

Semantic interpretations of raw captures remain non-canonical until reviewed. Candidate identity, confidence, evidence provenance and explicit promotion are defined in [derived-candidates.md](derived-candidates.md).

## Application lifecycle

Initial APK bootstrap and subsequent signed update behavior are defined in [app-lifecycle.md](app-lifecycle.md). Application release versions remain independent from protocol contract versions.
