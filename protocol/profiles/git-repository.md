# Git Repository Backend Profile v0.1

This profile defines an optional repository layout for Git-backed spatial/capture repositories.

It is NOT a requirement of Core, Spatial, App Sync, Federation or XR.

A SQL/EAV-backed provider and a Git-backed provider may implement the same public contracts.

## Layout

Below a configurable spatial root:

```text
<spatial_root>/
├── raw/
│   ├── scans/
│   │   └── <scan-id>/
│   └── observations/
├── model/
│   ├── buildings.jsonl
│   ├── floors.jsonl
│   ├── rooms.jsonl
│   ├── assets.jsonl
│   ├── landmarks.jsonl
│   └── relations.jsonl
└── display/
    ├── manifest.json
    ├── scenes/
    ├── labels/
    └── tasks/
```

A deployment MAY use different concrete files beneath the logical layers if its adapter documents them. The important invariant is the semantic separation of raw evidence, canonical model and generated display material.

## raw

Raw data is source evidence and MUST NOT be silently rewritten.

A scan may contain:

- manifest,
- scene anchors,
- spatial mesh,
- trajectory,
- optional GNSS/location observations,
- device/runtime metadata,
- checksums,
- original vendor payloads useful for provenance.

## model

The model layer contains the canonical model for the Git-backed source.

It is independent of PICO, Meta, OpenXR runtime, Home Assistant, Gitea and GitHub.

Vendor-specific IDs are bindings, not canonical object identity.

When projected through the Spatial contract, the adapter owns a stable `sourceId` and stable source-scoped `objectId` values.

## display

Display data is generated and disposable.

Device variants are selected by capabilities rather than hard-coded vendor directories.

The canonical display manifest schema lives at:

```text
protocol/schemas/profiles/git-display-manifest.schema.json
```

## Upload semantics

XR scan upload is retry-safe:

- stable scan ID,
- content hashes,
- repeated identical uploads are idempotent,
- acknowledgment only after durable repository persistence.

The XR client may delete its only scan outbox copy only after durable commit.

## Git revisions

A Git commit hash MAY be exposed as an opaque `sourceRevision` where that commit accurately represents the relevant source state.

Clients MUST still treat the revision as opaque and MUST NOT infer ordering from it.

A route/principal-specific `viewRevision` remains necessary when authorization/projection can change without changing the underlying commit.

## AI independence

This backend profile does not require AI.

Deterministic normalization may promote already structured evidence into model/display forms.

AI enrichment remains optional, additive and provenance-preserving.
