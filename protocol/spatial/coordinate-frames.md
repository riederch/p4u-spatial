# Spatial Coordinate Frames

Spatial data uses explicit named coordinate frames.

## Canonical conventions

Canonical local/site frames are:

- right-handed,
- unit: metre,
- X: East,
- Y: North,
- Z: Up,
- quaternion order: `[x, y, z, w]`.

XR-runtime-native coordinates are never assumed to use this convention. The XR adapter normalizes poses at its boundary.

## Typical hierarchy

```text
xr-runtime-local
       |
       v
scan
       |
       v
site or building
   |          |
 floor      outdoor
   |
 room
       |
       v
CRS / Earth
```

Frames are not required to form one fixed tree. Relations are represented by explicit transforms.

## Frame kinds

Initial kinds:

- `xr-runtime`
- `scan`
- `room`
- `floor`
- `building`
- `site`
- `crs`

A `crs` frame identifies its CRS explicitly, preferably using an EPSG identifier where applicable.

## Registration

For site/building registration use three or more non-collinear control points where practical.

Store:

- source/target frame,
- transform method,
- control points,
- residuals,
- RMS error,
- maximum error,
- creation time,
- provenance.

Two control points may be sufficient for constrained 2D workflows but are not the preferred general registration method.

## Transform classes

- `rigid-3d`: rotation + translation, scale fixed to 1.
- `similarity-3d`: rotation + translation + uniform scale.
- `crs-operation`: CRS-defined coordinate operation.

Scanner-to-site registration SHOULD normally be `rigid-3d`.

A scale materially different from 1 is diagnostic evidence and MUST NOT be silently accepted.

## Precision

Coordinates and transform parameters are serialized as JSON numbers.

Source measurements MUST NOT be rounded merely for presentation.

Quality metadata is required for registrations used as authoritative alignment.
