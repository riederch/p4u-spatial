# ADR 0030: Optional External GNSS Positioning Feature

Status: Accepted

Date: 2026-09-21

## Context

P4U Spatial separates scanner-local XR coordinates from globally meaningful GIS coordinates through
ADR 0003.

An external GNSS receiver can add coarse global context for site/building plausibility, outdoor
capture sessions, trajectory recording, GIS preselection and later registration workflows between a
local XR frame and a GIS frame.

The Garmin GLO 2 is the first reference device planned for this role. Device-specific update rate,
accuracy, Bluetooth transport and payload details are hardware properties rather than P4U Spatial
architectural guarantees and must be validated on the actual PICO host.

P4U Spatial should not depend on a third-party mock-location application merely to consume an
external receiver.

## Decision

P4U Spatial adds GNSS as an optional modular positioning feature.

GNSS is not part of the mandatory application core and is not required for local XR operation.

### Positioning-source abstraction

The feature uses a vendor-neutral positioning-source contract:

```text
GnssPositionSource
├── external Bluetooth GNSS
│   └── Garmin GLO 2 reference adapter
├── future Android/internal GNSS adapter
└── future RTK/high-accuracy adapter
```

The feature and HUD do not depend directly on Garmin-specific classes.

The external Bluetooth adapter communicates with the receiver directly from the app. Android Mock
Location is not the architectural integration path.

The exact GLO 2 Bluetooth payload/stream format is an adapter detail and must be verified on PICO
hardware. NMEA may be used when confirmed by the hardware spike, but it is not part of the generic
`GnssPositionSource` contract.

### Normalized fix model

A GNSS fix carries explicit provenance and timing. It supports:

- source ID/type,
- explicit reference system,
- latitude/longitude,
- optional altitude,
- optional horizontal/vertical accuracy,
- optional speed/course,
- optional receiver timestamp,
- host monotonic receive timestamp,
- optional fix/satellite/dilution quality metadata.

Missing quality fields remain missing; adapters do not invent them.

### GNSS versus XR tracking

GNSS provides coarse global context. PICO tracking remains authoritative for precise local pose and
geometry.

A GNSS fix must not automatically become the precise scanner-local-to-GIS transform.

GNSS may seed site selection, provide plausibility, tag an outdoor capture, provide a timestamped
trajectory, or assist a later control-point registration process.

Precise registration remains governed by ADR 0003.

### Temporal correlation

GNSS fixes and PICO poses may be correlated by timestamp. The host monotonic receive timestamp is
recorded for every fix used in correlation.

Receiver time is preserved when available but is not assumed perfectly synchronized with the PICO
clock until measured on hardware.

### Source selection

The selected positioning source is explicit. The system does not silently switch sources while
pretending provenance is unchanged.

The Garmin GLO 2 is the initial external source target.

### Feature state

The GNSS feature has one authoritative runtime state:

```text
Disabled
Disconnected
Connecting
ConnectedNoFix
FixAvailable
Degraded
Error
```

The feature defaults to disabled until explicitly enabled/configured.

### Unified HUD integration

GNSS integrates through ADR 0029.

```text
Positionierung
└── GNSS
    ├── Ein / Aus
    ├── Quelle
    ├── Gerät
    ├── Verbindung
    └── Positionsqualität
```

Status rail behavior:

- disabled: no normal GNSS icon,
- valid fix: healthy/active,
- connected without fix: waiting,
- enabled but disconnected/degraded: warning,
- fatal adapter error: error.

Detailed coordinates, accuracy and satellite diagnostics belong in a detail context, not permanent
peripheral text.

### Capture and storage

Enabling GNSS does not automatically create permanent location history.

A capture workflow may explicitly attach the latest valid fix, a bounded trajectory segment and
source/quality provenance.

### Privacy

The app does not silently enable GNSS or continuously upload location merely because a receiver is
paired.

GNSS data becomes Bridge/Spatial data only when an explicit workflow includes it.

### Hardware validation

Garmin GLO 2 is the first hardware target. Before the adapter is marked complete, validate on the
real PICO 4 Ultra:

- Bluetooth pairing,
- direct app connection,
- actual transport/profile and payload,
- observed fix cadence,
- available quality fields,
- timestamp behavior,
- reconnect after sleep/range loss/power cycle,
- permissions across restart,
- coexistence with Spatial UI and SecureMR QR,
- runtime/power impact,
- HUD states for no-fix and disconnect.

## Consequences

- Global positioning can be added without coupling app core to Garmin hardware.
- Future GNSS/RTK sources can reuse the same feature/HUD/data model.
- Consumer GNSS is not misrepresented as authoritative local geometry.
- GNSS becomes the first real second feature used to validate ADR 0022/0029 modularity.
- Full scanner-local-to-GIS registration remains a separate task under ADR 0003.

## Planned implementation boundaries

No production GNSS implementation is claimed yet.

Planned boundaries:

- `gnss` — fix/state/source contracts,
- `gnss-bluetooth` — external Bluetooth transport/adapters,
- `gnss-ui` — HUD contributions/detail presentation,
- app composition — adapter selection and wiring.

## Related decisions

- ADR 0003: Spatial Coordinate Frames
- ADR 0022: Modular App Foundation and Features
- ADR 0024: Headset Offline State, Durable Outbox and Secure Credentials
- ADR 0029: Unified XR HUD Interaction Shell
