# ADR 0001: System boundaries

Status: Accepted

## Decision

P4U Spatial is a public, generic software project. Site-specific knowledge remains in an external data repository.

The headset communicates only with the P4U Spatial Bridge. Repository access is performed by the bridge through interchangeable Gitea and GitHub providers.

## Consequences

- no repository credentials on the headset,
- no RCHKB-specific paths in application code,
- the bridge is the authorization boundary,
- the same bridge runs standalone or as a Home Assistant add-on,
- scanner, model and repository provider can evolve independently.
