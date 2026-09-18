# Coordinate Frames

## Canonical conventions

P4U Spatial uses explicit named coordinate frames.

Canonical local/site frames are:

- right-handed,
- unit: metre,
- X: East,
- Y: North,
- Z: Up,
- quaternion order: `[x, y, z, w]`.

XR-runtime-native coordinates are never assumed to use this convention. The XR adapter is responsible for normalizing poses at its boundary.

## Frame hierarchy

Typical hierarchy:

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

Frames are not required to form one fixed tree; relations are represented by explicit transforms.

## Frame kinds

Initial kinds:

- `xr-runtime`
- `scan`
- `room`
- `floor`
- `building`
- `site`
- `crs`

A frame of kind `crs` identifies its CRS explicitly, preferably with an EPSG identifier when applicable.

## Registration

For site/building registration, use three or more non-collinear control points where practical.

Store:

- source and target frame,
- transform method,
- control points,
- residuals,
- RMS error,
- maximum error,
- creation timestamp,
- provenance.

Two points may be sufficient for some constrained 2D workflows but are not the preferred registration method.

## Transform classes

- `rigid-3d`: rotation + translation, fixed scale 1.
- `similarity-3d`: rotation + translation + uniform scale.
- `crs-operation`: coordinate operation defined by CRS tooling rather than a local rigid transform.

Scanner-to-site registration should normally be `rigid-3d`. A scale differing materially from 1 is diagnostic evidence and should not be silently accepted.

## Precision

Coordinates and transform parameters are serialized as IEEE-754 JSON numbers. Do not round source measurements merely for presentation.

Quality metadata is mandatory for registrations used as authoritative alignment.
