# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for P4U Spatial.

ADRs record architectural decisions that should remain understandable independently of the
implementation history. They complement `docs/architecture.md`: the architecture document
describes the current system, while ADRs explain why important constraints and structures exist.

Historical ADRs were reconciled against the current repository on 2026-09-21. See the [ADR/code reconciliation baseline](reconciliation-2026-09-21.md).

## Areas

ADRs are grouped by architectural ownership:

- [Bridge](bridge/) — server behavior, deployment, pairing implementation, processing and Bridge-owned state.
- [App](app/) — headset/client architecture, XR runtime integration, reusable app features and persistent XR UI patterns.
- [Contracts](contracts/) — public interoperability contracts, protocol semantics, identities, authorization scopes and cross-implementation invariants.

Cross-cutting decisions live in the area with primary architectural ownership and reference related ADRs in other areas when needed.

ADR numbers are global across all areas. A number is never reused merely because an ADR lives in a different directory.

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

ADRs use a monotonically increasing four-digit number and live below their owning area:

```text
docs/adr/<area>/NNNN-short-kebab-case-title.md
```

Examples:

```text
docs/adr/bridge/0018-web-managed-configuration.md
docs/adr/app/0019-reusable-qr-reader-feature.md
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

## Code traceability

Accepted decisions with concrete implementation are linked in both directions.

### Code to ADR

At the architectural boundary, add an `ADR:` comment using the full repository-relative path and a short explanation:

```kotlin
// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — QR actions stay pluggable and app-specific.
```

The reference belongs at a module, class, adapter, state owner or non-obvious implementation point. Do not annotate every helper merely because it is transitively affected.

### ADR to code

An accepted ADR with concrete implementation should contain an `Implementation anchors` section:

```markdown
## Implementation anchors

- `path/to/primary/file.kt` — what part of the decision this file implements.
```

Keep this list focused on architectural anchors rather than every touched file.

### Verification

`npm run check:adr-traceability` verifies code-side ADR paths and ADR-side implementation anchors.

## Changing a decision

Do not silently rewrite an accepted architectural decision into a different one.

For small clarifications that do not change the decision, update the existing ADR.

For a material change:

1. create a new ADR,
2. reference the old ADR,
3. mark the old ADR `Superseded by ADR NNNN`,
4. update `docs/architecture.md` if the current architecture changed.

## Index

### Bridge

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](bridge/0001-system-boundaries.md) | System boundaries | Accepted |
| [0002](bridge/0002-authentication-and-device-pairing.md) | Authentication and device pairing | Accepted |
| [0004](bridge/0004-ai-optional-deterministic-core.md) | AI optional, deterministic core | Accepted |
| [0018](bridge/0018-web-managed-configuration.md) | Web-managed Bridge configuration | Accepted |
| [0025](bridge/0025-admin-authentication-and-bootstrap.md) | Administrator authentication and first-run bootstrap | Accepted |

### App

| ADR | Decision | Status |
| --- | --- | --- |
| [0019](app/0019-reusable-qr-reader-feature.md) | Reusable QR reader feature | Accepted |
| [0020](app/0020-securemr-qr-scanner-backend.md) | SecureMR QR scanner backend | Accepted |
| [0021](app/0021-xr-control-and-status-hud.md) | XR control and status HUD | Accepted |
| [0022](app/0022-modular-app-foundation-and-features.md) | Modular app foundation and features | Accepted |
| [0023](app/0023-xr-application-update-trust.md) | XR application update trust and release lifecycle | Accepted |
| [0024](app/0024-headset-offline-state-and-secure-storage.md) | Headset offline state, durable outbox and secure credentials | Accepted |

### Contracts

| ADR | Decision | Status |
| --- | --- | --- |
| [0003](contracts/0003-spatial-coordinate-frames.md) | Spatial coordinate frames | Accepted |
| [0005](contracts/0005-protocol-layering.md) | Protocol layering | Superseded by 0027 |
| [0006](contracts/0006-source-route-identity.md) | Source and route identity | Accepted |
| [0007](contracts/0007-authentication-boundary.md) | Authentication boundary | Accepted |
| [0008](contracts/0008-app-sync-independence.md) | App Sync independence | Accepted |
| [0009](contracts/0009-durable-relay.md) | Durable relay | Accepted |
| [0010](contracts/0010-repository-layout-profile.md) | Repository layout profile | Accepted |
| [0011](contracts/0011-source-wide-operation-idempotency.md) | Source-wide operation idempotency | Accepted |
| [0012](contracts/0012-federation-access-modes.md) | Federation access modes | Accepted |
| [0013](contracts/0013-xr-as-profile-over-core.md) | XR as a profile over Core | Accepted |
| [0014](contracts/0014-relation-authority.md) | Relation authority | Accepted |
| [0015](contracts/0015-publish-boundary.md) | Publish boundary | Accepted |
| [0016](contracts/0016-artifact-immutability.md) | Artifact immutability | Accepted |
| [0017](contracts/0017-discovery-and-namespace-registry.md) | Discovery and namespace registry | Superseded by 0027 |
| [0026](contracts/0026-derived-candidate-review-and-promotion.md) | Derived candidate review and explicit promotion | Accepted |
| [0027](contracts/0027-separate-xr-app-contract.md) | Separate XR application lifecycle contract and discovery registry | Accepted |
| [0028](contracts/0028-delegated-user-federation-methods.md) | Delegated-user federation supports PKCE and token exchange | Accepted |

## Relationship to repository rules

Repository-wide invariants in `AGENTS.md` remain mandatory. An ADR may explain or refine an
invariant but must not silently contradict it. If an accepted decision requires changing an
invariant, both changes must be made together.
