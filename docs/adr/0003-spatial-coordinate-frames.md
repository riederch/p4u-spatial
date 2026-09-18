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

Phone GNSS is optional and coarse. It may aid site-level plausibility or trajectory optimization but is not the authoritative precise transform.

## Quality

Transforms should carry provenance and quality metadata such as method, control points, RMS error and maximum residual.
