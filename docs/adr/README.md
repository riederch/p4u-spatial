# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for P4U Spatial.

ADRs record architectural decisions that should remain understandable independently of the
implementation history. They complement `docs/architecture.md`: the architecture document
describes the current system, while ADRs explain why important constraints and structures exist.

## When to create an ADR

Create an ADR when a change introduces or materially changes one or more of the following:

- system or trust boundaries,
- protocol or interoperability contracts,
- persistence or synchronization semantics,
- security or authentication rules,
- public module boundaries or reusable APIs,
- XR runtime/vendor abstraction boundaries,
- long-lived UI interaction patterns,
- deployment/configuration authority,
- technology choices that are expensive to reverse.

Do not create an ADR for routine refactoring, bug fixes, dependency updates, visual polish or
implementation details that do not constrain future architecture.

## File naming

ADRs use a monotonically increasing four-digit number:

```text
NNNN-short-kebab-case-title.md
```

Examples:

```text
0018-web-managed-configuration.md
0019-reusable-qr-reader-feature.md
```

Numbers are never reused. Superseded ADRs remain in the repository.

## Status

Use exactly one of these states:

- `Proposed` — under discussion; implementation must not rely on it as a stable invariant.
- `Accepted` — approved architectural direction.
- `Deprecated` — retained for history but should not be used for new work.
- `Superseded by ADR NNNN` — replaced by a newer ADR.

Acceptance does not mean implementation is complete. Implementation status belongs in issues,
plans, release notes or project documentation.

## ADR structure

New ADRs should use [template.md](template.md).

Required sections:

1. **Context** — problem, constraints and forces.
2. **Decision** — the architectural rule or direction.
3. **Consequences** — important positive and negative effects.

Use **Alternatives considered** when the choice would otherwise be hard to reconstruct.

## Changing a decision

Do not silently rewrite an accepted architectural decision into a different one.

For small clarifications that do not change the decision, update the existing ADR.

For a material change:

1. create a new ADR,
2. reference the old ADR,
3. mark the old ADR `Superseded by ADR NNNN`,
4. update `docs/architecture.md` if the current architecture changed.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-system-boundaries.md) | System boundaries | Accepted |
| [0002](0002-authentication-and-device-pairing.md) | Authentication and device pairing | Accepted |
| [0003](0003-spatial-coordinate-frames.md) | Spatial coordinate frames | Accepted |
| [0004](0004-ai-optional-deterministic-core.md) | AI optional, deterministic core | Accepted |
| [0005](0005-protocol-layering.md) | Protocol layering | Accepted |
| [0006](0006-source-route-identity.md) | Source and route identity | Accepted |
| [0007](0007-authentication-boundary.md) | Authentication boundary | Accepted |
| [0008](0008-app-sync-independence.md) | App Sync independence | Accepted |
| [0009](0009-durable-relay.md) | Durable relay | Accepted |
| [0010](0010-repository-layout-profile.md) | Repository layout profile | Accepted |
| [0011](0011-source-wide-operation-idempotency.md) | Source-wide operation idempotency | Accepted |
| [0012](0012-federation-access-modes.md) | Federation access modes | Accepted |
| [0013](0013-xr-as-profile-over-core.md) | XR as a profile over Core | Accepted |
| [0014](0014-relation-authority.md) | Relation authority | Accepted |
| [0015](0015-publish-boundary.md) | Publish boundary | Accepted |
| [0016](0016-artifact-immutability.md) | Artifact immutability | Accepted |
| [0017](0017-discovery-and-namespace-registry.md) | Discovery and namespace registry | Accepted |
| [0018](0018-web-managed-configuration.md) | Web-managed Bridge configuration | Accepted |
| [0019](0019-reusable-qr-reader-feature.md) | Reusable QR reader feature | Accepted |
| [0020](0020-securemr-qr-scanner-backend.md) | SecureMR QR scanner backend | Accepted |
| [0021](0021-xr-control-and-status-hud.md) | XR control and status HUD | Accepted |

## Relationship to repository rules

Repository-wide invariants in `AGENTS.md` remain mandatory. An ADR may explain or refine an
invariant but must not silently contradict it. If an accepted decision requires changing an
invariant, both changes must be made together.
