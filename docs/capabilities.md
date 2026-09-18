# XR Capability Model

P4U Spatial selects functionality by capability, not by headset model.

## Capability discovery

At startup the XR adapter reports a normalized capability set. A capability means that the adapter can provide the documented P4U Spatial behavior regardless of whether it is backed by OpenXR core, an OpenXR extension or a vendor SDK.

Initial capability names:

- `head-pose`
- `controller-input`
- `hand-tracking`
- `passthrough`
- `scene-capture`
- `scene-mesh`
- `plane-tracking`
- `spatial-anchors`
- `persistent-anchors`
- `marker-tracking`
- `image-tracking`
- `environment-depth`
- `camera-access`
- `room-semantics`

Capabilities are additive. Unknown capability strings must be ignored by older consumers.

## Rules

- Never gate generic behavior on `platform == pico` or `model == quest-3` when a capability check can express the requirement.
- A vendor adapter may expose a capability only if it can normalize the result into the P4U Spatial contract.
- Vendor identifiers remain provenance/bindings and are never canonical entity identifiers.
- If a feature has a deterministic fallback, the fallback should remain available when the richer capability is absent.

## Example

A registration workflow might require:

```text
required:
  head-pose

one-of:
  marker-tracking
  manual-landmark-selection
```

A room scan may use `scene-capture` when available and fall back to manual geometry capture otherwise.
