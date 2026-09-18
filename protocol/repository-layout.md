# Repository Layout Protocol

The connected data repository contains three logical layers below a configurable spatial root.

```text
<spatial_root>/
├── raw/
│   └── pico4u/
│       ├── scans/
│       └── observations/
├── model/
│   ├── buildings.jsonl
│   ├── floors.jsonl
│   ├── rooms.jsonl
│   ├── assets.jsonl
│   ├── landmarks.jsonl
│   └── relations.jsonl
└── display/
    └── pico4u/
        ├── manifest.json
        ├── scenes/
        ├── labels/
        └── tasks/
```

## raw

Raw data is source evidence. Agents must not silently rewrite it.

A scan should have a stable scan ID and may include:
- manifest,
- scene anchors,
- spatial mesh,
- trajectory,
- optional phone location stream,
- device metadata,
- checksums.

## model

The canonical model is independent of PICO, Home Assistant, Gitea and GitHub. It represents normalized spatial entities and relationships.

## display

Display data is generated for the headset. It is disposable and can be regenerated from the canonical model.

## Upload semantics

A scan upload must be idempotent:
- stable scan ID,
- content hashes,
- retry-safe bridge endpoint,
- bridge acknowledgment only after durable repository persistence.

The headset may delete an outbox item only after successful acknowledgment.

## Provider independence

The same layout and logical commit result must be produced with both Gitea and GitHub. Provider-specific commit mechanics are an implementation detail of the bridge.
