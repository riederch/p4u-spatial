# XR Capture Package v0.1

## Purpose

An XR scan is primary evidence, not a canonical Spatial mutation.

The capture package preserves enough raw and structured evidence to:

- reconstruct headset motion,
- inspect captured scene geometry,
- bind vendor/runtime anchors without promoting them to canonical object identity,
- derive rooms/assets/landmarks later,
- repeat semantic processing when algorithms improve.

## Coordinate frames

Every capture has a scan-local metric frame:

```text
scan:<scanId>
```

All poses and geometry MUST declare the frame they use.

The scan-local frame is not assumed to be georeferenced.

Registration to an existing Spatial Source is represented separately as evidence and MAY be added later.

## Recommended files

A capture package may contain:

```text
manifest.json
trajectory.jsonl
scene.json
meshes/
  <mesh-id>.glb
anchors.json
images/
  <image-id>.jpg
depth/
  ...
notes.json
```

Only files actually present are listed in the manifest.

### trajectory.jsonl

Each line contains a timestamped headset pose:

```json
{
  "t": "2026-09-19T12:00:00.123Z",
  "frame": "scan:<scanId>",
  "position": [1.2, 1.65, -0.4],
  "orientation": [0.0, 0.0, 0.0, 1.0],
  "tracking": "tracked"
}
```

Position units are metres. Quaternion order is x, y, z, w.

### scene.json

Optional runtime scene understanding output.

It may contain walls, floors, ceilings, openings, tables or other runtime labels. These are observations and MUST NOT silently become canonical Spatial objects.

### meshes/

Optional scene/spatial meshes. glTF/GLB is the preferred interchange representation when the runtime can export it.

Meshes are evidence in the scan-local frame.

### anchors.json

Runtime anchors are stored as bindings:

```json
{
  "anchors": [
    {
      "bindingId": "anchor:...",
      "provider": "pico",
      "providerAnchorId": "...",
      "frame": "scan:<scanId>",
      "pose": {
        "position": [0, 0, 0],
        "orientation": [0, 0, 0, 1]
      }
    }
  ]
}
```

A vendor anchor ID is never a replacement for a Spatial `objectId`.

An anchor may additionally reference a canonical object:

```json
{
  "subject": {
    "sourceId": "...",
    "objectId": "asset:..."
  }
}
```

## Capture intent

The scan manifest may include a `capture` object:

- `purpose`: room-survey, building-survey, asset-registration, registration, drift-test or free-capture,
- `subject`: optional canonical Spatial subject,
- `precision`: relative-only, local-metric or registered,
- `runtimeCapabilities`: capabilities actually used for this capture.

A capture with no reliable registration remains valid evidence.

## Promotion into Spatial data

Promotion is a separate operation:

```text
raw XR capture
    -> derived candidates
    -> human/automated validation
    -> explicit Spatial Write
    -> optional RCHKB projection update
```

The raw scan is immutable after durable commit.

Derived models MUST retain provenance back to the scan ID and, where practical, the specific evidence file or anchor binding.

## PICO binding

A PICO implementation may use runtime facilities such as spatial mesh, scene capture and spatial anchors.

PICO-specific identifiers and labels stay inside evidence/binding fields. The Open Spatial Interop representation remains vendor-neutral.
