# Site Mapping and Field Registration

P4U Spatial supports continuous spatial capture across buildings and outdoor areas.

Typical workflow:

```text
Main building
    |
    v
yard / paths
    |
    +--> outbuilding
    |
    +--> barn
    |
    +--> outdoor assets such as lamps, shafts, gates or wood piles
```

## Tracking strategy

The headset performs local 6DoF tracking. Long paths may accumulate drift, therefore site mapping must not assume that a single uninterrupted XR tracking frame remains globally exact.

Position quality is improved through a combination of:

1. local XR tracking,
2. known spatial landmarks,
3. explicit registration control points,
4. optional coarse GNSS observations,
5. deterministic trajectory optimization where possible.

## Landmarks

Landmarks are real-world features that can be recognized or manually confirmed.

### Hard/stable landmarks

Preferred for registration and correction:

- building corners,
- lamp posts,
- gates,
- fixed posts,
- shafts/manholes,
- stable facade details,
- deliberately installed visual markers.

### Soft landmarks

Useful as additional evidence but not authoritative alone:

- hedges,
- trees,
- vegetation,
- movable storage,
- wood piles,
- parked machinery.

Each landmark carries an explicit stability class and provenance. A normal asset may also carry the role `spatial-landmark`; the physical object remains one canonical entity.

Vendor-specific anchor IDs are bindings to that canonical landmark, not the landmark identity itself.

## Artificial markers

AprilTag, ArUco, QR-like markers or other supported visual markers may be used at strategic points where natural landmarks are insufficient.

A small number of well-placed markers is preferred over making the whole site dependent on artificial markers.

## Optional GNSS

Phone or external GNSS may be injected as an optional location source for site mapping.

GNSS is supporting evidence, not the authoritative precise registration mechanism for building-scale alignment.

Initial logical providers:

- `none`
- `phone`
- `manual`
- `external-gnss`

GNSS observations should include timestamp, latitude, longitude, optional altitude, reported horizontal/vertical accuracy and provider/source metadata.

## Asset capture

Outdoor objects may be captured as appropriate:

- point,
- line/path,
- footprint/polygon,
- 3D box,
- mesh,
- semantic observation linked to existing geometry.

The system must preserve uncertainty and must not invent a precise position when the available tracking evidence is weak.

## Drift and loop-closure tests

P4U Spatial should support deterministic tracking diagnostics.

A useful field test is reaching the same physical point by two different routes, for example:

```text
Route A: through main building -> stairs -> cellar
Route B: outside around building -> external cellar access
```

At the common endpoint compare:

- delta X,
- delta Y,
- delta Z,
- 3D distance error,
- heading/orientation delta,
- travelled distance,
- tracking-loss count,
- recognized landmarks,
- relocalization/correction events,
- elapsed time.

A loop-closure test may start and end at the same known landmark. Test results are measurements and should be stored as raw/diagnostic evidence, not silently used to rewrite source scans.
