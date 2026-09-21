# ADR 0003: Spatial coordinate frames

Status: Accepted

## Decision

P4U Spatial uses explicit coordinate frames and explicit transforms between them.

Required conceptual hierarchy:

```text
scanner-local -> room -> floor -> building -> GIS
```

No component may assume that scanner-local coordinates are globally meaningful.

## Registration

A building is registered to GIS once using multiple known control points where possible. Stable infrastructure landmarks such as building corners, lamp posts, gates, shafts or fixed posts are preferred. Artificial markers may be added where natural landmarks are insufficient.

GNSS, including internal or external receivers, is optional and coarse relative to local XR
registration. It may aid site-level plausibility, outdoor trajectory capture or trajectory
optimization but is not the authoritative precise transform. External GNSS integration is defined
by ADR 0030.

## Quality

Transforms should carry provenance and quality metadata such as method, control points, RMS error and maximum residual.

## Implementation anchors

- `protocol/spatial/coordinate-frames.md` — canonical frame conventions, registration quality and explicit transforms.
- `protocol/schemas/spatial/coordinate-frame.schema.json` — machine-readable Spatial frame representation.
- `protocol/schemas/spatial/transform.schema.json` — explicit transform representation.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/CapturePackage.kt` — scan-local frame and pose/canonical-subject evidence emitted by the headset.

## Reconciliation note

The contract and capture representation are present. Full control-point registration, residual calculation and authoritative GIS registration are not yet implemented end-to-end in the reference app/Bridge.


## Related decisions

- ADR 0030: Optional External GNSS Positioning Feature
