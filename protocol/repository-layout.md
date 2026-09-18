# Repository Layout Protocol

The connected data repository contains three logical layers below a configurable spatial root.

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

The layout is headset-vendor-neutral. Device/platform provenance belongs in manifests and observations, not in fixed top-level vendor directories.

## raw

Raw data is source evidence and must not be silently rewritten.

A scan has a stable scan ID and may include:
- manifest,
- scene anchors,
- spatial mesh,
- trajectory,
- optional phone/GNSS observations,
- device and runtime metadata,
- checksums,
- original vendor payloads where useful for provenance.

## model

The canonical model is independent of PICO, Meta, OpenXR runtime, Home Assistant, Gitea and GitHub.

Vendor-specific anchor IDs are stored as bindings to canonical entities, not as canonical entity IDs.

## display

Display data is generated and disposable. Device-specific variants are selected by capabilities rather than by repository layout.

## Upload semantics

A scan upload is idempotent:
- stable scan ID,
- content hashes,
- retry-safe bridge endpoint,
- acknowledgment only after durable repository persistence.

The headset may delete an outbox item only after successful acknowledgment.

## AI independence

The repository protocol does not require an AI processor. Deterministic processing can move already-structured inputs from raw evidence into canonical and display forms. AI enrichment is optional and additive.
