# Architecture

## System boundary

```text
PICO 4 Ultra
    |
    | Bridge API
    v
P4U Spatial Bridge
    |-- device pairing / sessions / revocation
    |-- sync / validation / idempotency
    |-- repository provider abstraction
    |
    +--> Gitea
    +--> GitHub

Agent processing
    raw/ -> model/ -> display/
```

The headset only knows the bridge URL, its device identity and its bridge session. It does not know repository credentials, Git commits, provider-specific APIs or private knowledge-base structure.

## Runtime components

### P4U Spatial Scanner
- indoor mapping using PICO scene/spatial capabilities,
- site mapping for outdoor assets and trajectories,
- landmark capture,
- display cache,
- durable upload outbox,
- task/observation workflow.

### P4U Spatial Bridge
- QR pairing,
- device registry,
- authorization and revocation,
- session issuance,
- upload validation,
- idempotent scan ingestion,
- repository commits,
- display synchronization,
- provider abstraction.

### Home Assistant add-on
The HA add-on packages the same bridge used by standalone deployments. Home Assistant is a deployment option, not a protocol dependency.

### Repository providers
Both Gitea and GitHub implement the same internal repository interface. Provider-specific commit mechanics must not leak into scanner or spatial protocol logic.

## Data flow

```text
scanner -> raw/ -> agent -> model/ -> publisher -> display/ -> scanner cache
             ^                                      |
             |------ observations / task answers ---|
```

## Device trust

Pairing starts in the add-on UI. A short-lived one-time QR payload authorizes a new device. The bridge then creates a persistent device identity and issues short-lived sessions.

Revocation must immediately invalidate both active sessions and future refresh attempts.

Recommended scanner scopes:
- display:read
- scan:write
- observation:write
- task:read
- task:answer

The scanner must never have canonical-model or repository-administration permission.

## Offline model

- `cache/`: reconstructable display data.
- `outbox/`: unacknowledged primary uploads; never evicted automatically.
- `state/`: sync state and non-secret metadata.
- secrets: OS secure storage / keystore only.

## Spatial modes

### Indoor Mapping
Rooms, walls, doors, windows, scene anchors, spatial meshes and technical assets.

### Site Mapping
Outdoor trajectories, buildings, landmarks and assets such as lamps, shafts, storage areas or wood piles.

## Spatial registration

Coordinate frames are linked explicitly:

```text
PICO local -> room -> floor -> building -> GIS
```

Known control points and stable landmarks are preferred for precise registration. Phone GNSS may be used as an optional coarse global signal, not as the sole precise registration method.

Landmarks may be:
- stable natural/infrastructure landmarks,
- manually confirmed landmarks,
- artificial visual markers,
- persistent headset anchors where appropriate.

Tracking drift should be measurable through recorded trajectories and loop-closure tests.
