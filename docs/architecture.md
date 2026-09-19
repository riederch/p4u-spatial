# Architecture

## Open interoperability boundary

P4U Spatial is a reference implementation of the open contracts incubated in `protocol/`; it is not the definition of every implementation's internal storage model.

```text
                    Core
                      |
          +-----------+-----------+
          |                       |
       Spatial                 App Sync
          |
      Federation
          |
          XR

Portable Backup = independent local file format
Git Repository  = optional backend profile
```

P4U Spatial primarily implements Core + Spatial + Federation + XR and a Git repository backend profile.

A separate application such as MultiGIS may implement the client side of Core/Spatial/App Sync. A content provider may expose Core + Spatial without any XR or Git internals.

## P4U system boundary

```text
XR Headset
    |
    v
Scanner Core
    |
    v
OpenXR-first XR Spatial Adapter
    |-- standard OpenXR capabilities
    |-- vendor fallback modules
    |
    v
P4U Spatial Bridge
    |-- Core auth identity
    |-- XR pairing / sessions / revocation
    |-- Spatial read/write/federation
    |-- deterministic spatial services
    |-- repository provider abstraction
    |
    +--> Gitea
    +--> GitHub

Optional processing:
raw/ -> deterministic normalization -> model/
                    |
                    +-> AI enrichment when available
model/ -> display/
```

The headset only knows discovered service URLs, its device identity and bridge/Core session. It does not know repository credentials or upstream federation credentials.

## Configuration and deployment boundary

P4U Spatial Bridge owns its functional configuration and persists it as Bridge state. Operators configure repository access, federation, Spatial behavior, XR settings, limits and credentials through the Bridge web interface.

Deployment wrappers are deliberately thinner than the Bridge:

```text
                    P4U Spatial Bridge
                   + persistent web config
                            |
              +-------------+-------------+
              |                           |
      Generic Docker                Home Assistant App
      lifecycle/storage             lifecycle/storage
      ports/volumes                 ports/ingress
              |                           |
              +-------------+-------------+
                            |
                   same Bridge artifact
```

Home Assistant is therefore not a configuration authority and contains no repository, federation, XR, Spatial or RCHKB business logic. A generic Docker deployment and the Home Assistant app use the same persisted Bridge configuration model.

Only values required before the web application can start may exist at the deployment/bootstrap boundary, and packaged deployments should minimize even those by using documented internal ports and fixed persistent-state locations. No new operator-facing functional setting belongs in a `P4U_*` environment variable.

A fresh installation uses a Bridge-owned first-run web setup flow for administrator bootstrap. See ADR 0018.

## XR portability boundary

The scanner core is capability-driven, not device-name-driven. OpenXR core and portable extensions are preferred. Vendor APIs are allowed only behind adapters when a required capability is unavailable through portable OpenXR.

Vendor anchor UUIDs and scene-object IDs are bindings, not canonical spatial entity IDs.

## Runtime vs protocol capabilities

Runtime capabilities describe what the XR hardware/runtime can do, such as scene mesh or hand tracking.

Protocol capabilities describe what an instance/route can do, such as `spatial.read` or `federation.durable-relay`.

Authorization scopes describe what the current principal/device is allowed to invoke.

These categories must not be conflated.

## Deterministic core

P4U Spatial must remain operational without an AI model.

Deterministic processing includes:

- raw capture and preservation,
- geometric transformations,
- trajectory storage,
- marker decoding and known-landmark lookup,
- control-point registration and residual calculation,
- repository synchronization,
- protocol validation,
- display of already structured canonical data.

AI is optional for semantic interpretation and enrichment. Failure or absence of AI degrades enrichment quality, not basic system availability.

## Device trust

Pairing is defined by the XR profile and bootstraps Core-compatible credentials.

Canonical XR scopes include:

- `xr.display.read`
- `xr.scan.write`
- `xr.observation.write`
- `xr.task.read`
- `xr.task.answer`

Detailed device authorization rules are in [device-management.md](device-management.md). Signed XR application bootstrap/update rules are in [XR Application Lifecycle](../protocol/xr/app-lifecycle.md).

## Offline model

- `cache/`: reconstructable display/provider data,
- `outbox/`: primary data or unacknowledged operations; durable,
- `state/`: synchronization metadata,
- secrets: OS secure storage / keystore only.

Detailed XR storage behavior is in [offline-storage.md](offline-storage.md).

## Spatial modes

### Indoor Mapping

Rooms, walls, doors, windows, scene anchors, spatial meshes and technical assets.

### Site Mapping

Outdoor trajectories, buildings, landmarks and assets such as lamps, shafts, gates, storage areas or wood piles.

Site mapping uses local XR tracking plus known landmarks and optional GNSS evidence. Long-range drift is measured rather than ignored. See [site-mapping.md](site-mapping.md).

## Coordinate frames

Coordinate-frame rules are part of the Spatial contract: [Spatial Coordinate Frames](../protocol/spatial/coordinate-frames.md).

XR runtime coordinates are normalized at the adapter boundary. Site-scale canonical geometry uses metres in a local East-North-Up frame where practical. The local frame is linked to an authoritative CRS through an explicit transform.

Known control points and stable landmarks are preferred for precise registration. Phone GNSS is optional coarse evidence, not the authoritative precise transform.

## Geometry delivery

Renderable meshes should use glTF/GLB where practical. Large geospatial 3D datasets may later use 3D Tiles. Semantic identity and geospatial placement remain explicit and are not inferred from render geometry.
