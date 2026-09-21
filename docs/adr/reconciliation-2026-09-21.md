# ADR / Code Reconciliation — 2026-09-21

This report establishes the first repository-wide baseline between accepted Architecture Decision
Records, protocol contracts and the current reference implementation.

It exists because ADRs 0001–0018 predate the explicit ADR↔code traceability process introduced on
2026-09-21. The purpose of this reconciliation is not to rewrite historical decisions to match the
code, but to make mismatches and implementation gaps explicit.

## Classification

- **Aligned** — the current implementation/contract materially embodies the decision.
- **Partial** — the decision is valid, but only part of the reference implementation exists.
- **Contract-only** — the protocol/workflow is defined, but this repository has no corresponding
  reference implementation yet.
- **Conflict** — current documentation/code contains an unresolved architectural inconsistency that
  needs an explicit follow-up decision.

## Summary

| ADR | Area | Status | Reconciliation |
| --- | --- | --- | --- |
| 0001 | Bridge | Aligned | Repository access remains behind the Bridge provider abstraction; headset profiles contain Bridge endpoints, not repository credentials. |
| 0002 | Bridge | Aligned | One-time QR pairing, administrator approval, scoped device sessions, disable/revoke and session revocation are implemented. |
| 0003 | Contracts | Partial | Explicit frame/transform contracts and scan-local capture evidence exist; full control-point registration/residual/GIS workflow is not yet end-to-end. |
| 0004 | Bridge | Aligned | Fundamental Bridge/capture flows remain deterministic; derived semantic candidates retain provenance and require review/promotion. |
| 0005 | Contracts | Superseded by 0027 | Original layering omitted the later independent xr-app contract; remaining layering invariants continue under ADR 0027. |
| 0006 | Contracts | Aligned / partial client | Local and federated source/route separation is implemented by the Bridge. Full multi-route client preference/deduplication is not yet a finished headset capability. |
| 0007 | Contracts | Aligned | One Core-authenticated device principal is reused across implemented protected contracts; canonical scopes are shared. |
| 0008 | Contracts | Contract-only | App Sync independence is fully specified, but there is no Account Provider implementation in this repository. |
| 0009 | Contracts | Aligned | Federation relay entries are durably persisted and distinguish relay responsibility from authoritative source commit. Artifact-dependent relay constraints remain blocked by ADR 0016 implementation. |
| 0010 | Contracts | Aligned | Git/raw-model-display storage is an optional backend profile behind repository abstractions. |
| 0011 | Contracts | Aligned | Direct and federated writes preserve source-wide operation identity and reject logical-content reuse. |
| 0012 | Contracts | Partial | Reference Federation implements anonymous/service access. delegated-user is specified but not implemented. |
| 0013 | Contracts | Aligned | XR is discovered/profiled over Core, with canonical XR scopes and legacy /api/v1 compatibility. |
| 0014 | Contracts | Partial | Relations use normal Spatial collections/write semantics. Efficient relation filtering is not implemented. |
| 0015 | Contracts | Contract-only | Explicit publish workflow is specified; no MultiGIS/App Sync reference client exists here. |
| 0016 | Contracts | Contract-only / implementation gap | Immutable Spatial Artifact contract exists; Bridge artifact read/upload endpoints are not implemented. |
| 0017 | Contracts | Superseded by 0027 | The previous xr-app registry ambiguity was explicitly resolved by ADR 0027. |
| 0018 | Bridge | Partial migration | Persisted BridgeConfigStore is authoritative after migration, but legacy functional `P4U_*` environment variables are still accepted as bootstrap/migration input. |
| 0019 | App | Partial | Generic QR lifecycle/content/actions are reusable; QR result presentation still lives in the product app layer. |
| 0020 | App | Aligned in code / hardware pending | SecureMR is an internal QR backend; first-valid decode, no overlay and ephemeral frames match ADR. PICO hardware validation remains required. |
| 0021 | App | Partial | Authoritative feature state and generic status projection exist. Lower-left menu, toggle UI and true head-locked HUD are not implemented. |
| 0022 | App | Aligned | app-core is feature-neutral, app-ui provides generic presentation infrastructure, qr-reader-ui owns QR presentation, and MainApplication is reduced to composition/registration. |
| 0023 | App | Aligned / reconstructed | Signed APK release trust, descriptor integrity/signing metadata and updater verification are documented and implemented; discovery key remains intentionally unresolved under ADR 0017. |
| 0024 | App | Aligned / reconstructed | Durable outbox, retry-safe upload and Android Keystore-backed refresh credential storage are implemented. |
| 0025 | Bridge | Aligned / reconstructed | Passkeys, password+TOTP, server-side sessions/CSRF and one-time first-run setup proof are implemented. |
| 0026 | Contracts | Aligned / reconstructed | Derived candidates remain non-canonical until explicit review/promotion using normal Spatial write authority/idempotency. |
| 0027 | Contracts | Aligned | xr-app is now explicitly a separate discoverable contract with canonical capability namespace xr-app.*. |

## Corrections made during this reconciliation

### Bridge traceability

Historical Bridge ADRs now identify primary implementation anchors and the corresponding code has
ADR references at the architectural boundaries:

- repository provider boundary,
- QR pairing lifecycle,
- deterministic candidate review/promotion,
- persisted Bridge configuration authority.

### Contract traceability

ADRs 0003 and 0005–0017 now identify protocol and implementation anchors. Where a contract is ahead
of the reference implementation, the ADR contains an explicit reconciliation note.

Representative Bridge/client implementations now link back to the relevant contract ADRs:

- Spatial source/route identity,
- source-wide operation idempotency,
- relation-authority write behavior,
- durable federation relay,
- federation access modes,
- canonical authorization namespaces,
- scan-local coordinate-frame handling.

### App boundary correction

`qr-reader` previously exposed `securemr-probe` as a Gradle `api` dependency. This made the PICO
vendor backend transitively visible outside the feature module, contrary to ADR 0020.

It has been changed to `implementation`, so SecureMR remains an internal backend dependency.

## Open architecture gaps

### 1. Spatial Artifacts

ADR 0016 is normative, but the Bridge does not implement:

- artifact descriptor/content reads,
- artifact upload sessions,
- artifact commit,
- artifact-dependent durable federation relay.

Until implemented, the Bridge must not advertise artifact capabilities or make artifact-dependent
durability guarantees.

### 2. Federation delegated-user

The contract reserves/defines `delegated-user`; the reference FederationService implements only:

- anonymous,
- service.

This is an implementation gap, not a reason to weaken ADR 0012.

### 3. Coordinate registration

The coordinate-frame contract is mature enough to describe quality/provenance, but the reference
system still lacks the complete deterministic control-point registration/residual pipeline required
by ADR 0003.

### 4. XR HUD

ADR 0021 remains intentionally ahead of implementation:

- no lower-left menu,
- no hierarchical menu rendering,
- no menu-backed QR toggle,
- status projection still lives inside the spatial app window,
- no final head-locked HUD interaction layer.

### 5. App modularization validation

The known composition-root violation found during the audit has been resolved:

- `app-core` remains UI/vendor/feature neutral,
- `app-ui` provides the generic presentation shell and presentation registry,
- `qr-reader-ui` owns QR-specific result/action/status presentation,
- `MainApplication` only composes registered features, presentations and product-specific custom actions.

The remaining work is validation with future features rather than a known architecture violation.

## Reconstructed ADRs added after the audit

Because no historical decision records remain for several already-implemented architecture areas,
new ADRs were created to establish the current intended architecture without inventing historical
rationale:

- ADR 0023 — XR application update trust and release lifecycle.
- ADR 0024 — headset offline state, durable outbox and secure credentials.
- ADR 0025 — Bridge administrator authentication and first-run bootstrap.
- ADR 0026 — derived candidate review and explicit Spatial promotion.

Each ADR contains a historical note stating that it is a reconstruction from the current
implementation and surviving documentation.

The former `xr-app` discovery-key ambiguity was resolved explicitly by ADR 0027: `xr-app` is a
separate first-class contract.

## Baseline rule going forward

After this reconciliation:

1. a new architectural decision gets an ADR before or with implementation;
2. architecture-relevant code links to the ADR using an `ADR:` comment;
3. accepted ADRs with concrete implementation list focused `Implementation anchors`;
4. CI verifies that those references still resolve;
5. implementation gaps are recorded as gaps rather than changing the ADR to describe incomplete
   code;
6. a material change to an accepted decision creates/supersedes an ADR explicitly.

This report is a historical baseline, not a permanent substitute for keeping individual ADRs and
code references current.
