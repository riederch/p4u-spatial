# Architecture

## System boundary

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
    |-- pairing / sessions / revocation
    |-- sync / validation / idempotency
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

The headset only knows the bridge URL, its device identity and its bridge session. It does not know repository credentials or provider-specific APIs.

## XR portability boundary

The scanner core is capability-driven, not device-name-driven. OpenXR core and portable extensions are preferred. Vendor APIs are allowed only behind adapters when a required capability is unavailable through portable OpenXR.

Vendor anchor UUIDs and scene-object IDs are bindings, not canonical spatial entity IDs.

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

AI is an optional processing tool for semantic interpretation and enrichment. Failure or absence of AI must degrade enrichment quality, not basic system availability.

## Device trust

Pairing starts in the bridge/add-on UI using a short-lived one-time QR payload. Revocation immediately invalidates active sessions and future refresh attempts.

Recommended scanner scopes:
- display:read
- scan:write
- observation:write
- task:read
- task:answer

## Offline model

- `cache/`: reconstructable display data.
- `outbox/`: unacknowledged primary uploads; never evicted automatically.
- `state/`: sync state and non-secret metadata.
- secrets: OS secure storage / keystore only.

## Spatial modes

### Indoor Mapping
Rooms, walls, doors, windows, scene anchors, spatial meshes and technical assets.

### Site Mapping
Outdoor trajectories, buildings, landmarks and assets such as lamps, shafts, storage areas or wood piles.

## Coordinate frames

```text
XR runtime local
        |
        v
scan frame
        |
        v
site/building frame
   |         |
 floors     outdoor
   |
 rooms
        |
        v
georeferenced CRS / Earth
```

XR runtime coordinates are normalized at the adapter boundary. Site-scale canonical geometry uses metres in a local East-North-Up frame where practical. The local frame is linked to an authoritative CRS through an explicit transform.

Known control points and stable landmarks are preferred for precise registration. Phone GNSS is optional coarse evidence, not the authoritative precise transform.

## Geometry delivery

Renderable meshes should use glTF/GLB where practical. Large geospatial 3D datasets may later use 3D Tiles. Semantic identity and geospatial placement remain explicit and are not inferred from render geometry.
