# External GNSS Feature Plan

Derived from:
- ADR 0030 — Optional External GNSS Positioning Feature
- ADR 0003 — Spatial Coordinate Frames
- ADR 0029 — Unified XR HUD Interaction Shell

Status: Planning baseline

## Goal

Add optional external GNSS positioning to picoVr without making GNSS a dependency of local XR
tracking or binding the app to one Garmin device.

Garmin GLO 2 is the first reference hardware target.

## Architecture

```text
app composition
    ├── gnss
    │    ├── GnssPositionSource
    │    ├── GeoFix
    │    └── GnssState
    ├── gnss-bluetooth
    │    └── Garmin GLO 2 adapter
    └── gnss-ui
         └── Unified HUD contributions

PICO tracking -> precise local pose
GNSS         -> coarse global position/trajectory
registration -> explicit transform to GIS per ADR 0003
```

## Reference GeoFix

```text
sourceId
sourceType
referenceSystem
latitude
longitude
altitudeMeters?
horizontalAccuracyMeters?
verticalAccuracyMeters?
speedMetersPerSecond?
courseDegrees?
sourceTimestamp?
receivedAtMonotonicNanos
quality {
  fixType?
  satellitesUsed?
  hdop?
  vdop?
}
```

## HUD

```text
Positionierung
└── GNSS
    ├── Ein / Aus
    ├── Quelle: Garmin GLO 2
    ├── Gerät: <paired device>
    ├── Verbindung: Verbunden
    └── Positionsqualität: ±x m / Kein Fix / ...
```

Status rail:

| Runtime | Status |
| --- | --- |
| Disabled | hidden |
| Connecting | connecting |
| ConnectedNoFix | waiting |
| FixAvailable | healthy |
| Degraded/Disconnected | warning |
| Error | error |

## Capture correlation

When a capture opts into GNSS:

1. preserve latest valid GeoFix,
2. correlate with host monotonic receive time,
3. optionally preserve bounded trajectory,
4. keep PICO local pose evidence separate,
5. never synthesize a precise GIS transform from one consumer GNSS fix.

## Garmin GLO 2 hardware spike

Before parser/adapter implementation:

- pair on PICO 4 Ultra,
- connect directly from app,
- identify Bluetooth profile/stream,
- inspect payload,
- measure update cadence,
- inspect quality fields,
- compare receiver time with host monotonic time,
- test reconnect after range loss/sleep/power cycle,
- run together with Spatial UI and SecureMR QR.

Do not make NMEA a generic dependency before observing the real stream.

## Persistence

Persist:
- enabled preference,
- selected source,
- selected paired-device identifier,
- reconnect settings.

Do not persist unlimited continuous location history merely because GNSS is enabled.

## Tests

Unit/host:
- normalization,
- state transitions,
- provenance/source switching,
- timestamp correlation,
- trajectory bounding,
- no silent fallback.

Hardware:
- real PICO + real GLO 2,
- valid fixes,
- HUD states,
- reconnect,
- capture correlation,
- no QR/SecureMR regression.

## Implementation order

```text
hardware transport spike
→ GNSS contracts
→ Bluetooth/Garmin adapter
→ feature state + persistence
→ HUD contribution
→ capture correlation
→ bounded trajectory
→ coordinate-registration integration
→ hardware acceptance
```

## Non-goals

- centimeter RTK in v1,
- replacing PICO pose tracking,
- Mock Location injection,
- automatic authoritative GIS transform,
- silent source fallback,
- unrelated background location history.
