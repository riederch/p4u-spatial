# Standards and Conventions

P4U Spatial reuses established XR, geospatial and web standards wherever practical.

## XR

### OpenXR 1.1
OpenXR is the primary XR runtime portability boundary.

Prefer portable, ratified spatial extensions when exposed by a runtime, including spatial entities, anchors, persistence, plane tracking, marker tracking and image tracking. Vendor SDKs remain fallback adapters.

OpenXR runtime spaces are local tracking spaces and must not be treated as georeferenced coordinates.

Reference: https://registry.khronos.org/OpenXR/

## Geospatial pose and coordinate reference systems

### OGC GeoPose 1.0
Use GeoPose concepts for exchange of Earth-referenced position and orientation.

For site-scale local frames, use Local Tangent Plane East-North-Up (LTP-ENU) where practical:
- X = East
- Y = North
- Z = Up
- unit = metre

Reference: https://www.ogc.org/standards/geopose/

### ISO 19111 / WKT2 / EPSG
CRS identity and coordinate operations must be explicit. Prefer registered EPSG identifiers where appropriate and WKT2 when a complete CRS definition is needed.

Do not silently discard or change the source CRS.

## 3D and building data

### glTF 2.0 / GLB
Preferred portable render asset format. glTF uses metres and a right-handed coordinate system. Axis conversion at XR/render boundaries must be explicit.

Reference: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

### CityGML 3.0 / CityJSON 2.x
Use CityGML as a semantic reference model for buildings and built-environment objects. Prefer CityJSON where JSON interchange with CityGML-style semantics is useful.

P4U Spatial does not require its canonical model to be stored literally as CityJSON, but import/export and entity semantics should remain compatible where practical.

References:
- https://www.ogc.org/standards/citygml/
- https://www.cityjson.org/specs/

### IndoorGML 2.0
Use IndoorGML concepts for indoor cells, connectivity and navigation topology. It complements geometry; it is not the sole building representation.

Reference: https://www.ogc.org/standards/indoorgml/

### GeoJSON RFC 7946
Use for lightweight 2D geographic interchange and footprints. Do not use GeoJSON as the canonical format for high-precision local 3D scan geometry.

### OGC 3D Tiles 1.1
Optional future format for streaming large geospatial 3D datasets. Not required for V1.

Reference: https://www.ogc.org/standards/3dtiles/

## Protocol conventions

### JSON Schema 2020-12
Protocol JSON objects should have versioned schemas.

### UUID — RFC 9562
Use UUIDs for globally unique protocol entity IDs. Prefer UUIDv7 for newly generated time-ordered records such as scans, observations and tasks.

### Time
Use RFC 3339 / ISO 8601 timestamps with an explicit offset. Persist UTC where practical while preserving original timestamps in provenance.

## P4U Spatial coordinate convention

Canonical site-local frame:
- right-handed,
- metres,
- X East,
- Y North,
- Z Up.

Serialized quaternions use component order `[x, y, z, w]`.

Every pose must identify its coordinate frame.

## Important boundary rule

Do not conflate:
- OpenXR tracking spaces,
- P4U Spatial site/building frames,
- geodetic/CRS coordinates,
- glTF render coordinates.

Conversions between them are explicit transformations with provenance and quality metadata.
