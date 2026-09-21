# Unified XR HUD State Catalogue

Derived from ADR 0029.

## H0 — Idle / collapsed

Visible:
- launcher icon lower-left,
- active status icons on right,
- no menu,
- no transient feedback,
- working scene unobstructed.

## H1 — Root navigation open

Visible:
- launcher,
- root navigation panel,
- status rail.

Initial root category:
- Erkennung

Future categories appear only when contributed by installed features.

## H2 — Recognition submenu

Path:
`Erkennung`

Rows:
- QR-Code-Erkennung — toggle reflecting authoritative state.

## H3 — Feature active

Example:
- QR-Code-Erkennung enabled.

Visible:
- normal collapsed HUD,
- QR status icon in status rail.

No scan frame or recognition overlay appears.

## H4 — QR result

Visible:
- collapsed HUD/status,
- central/spatial QR result panel.

Panel:
- title,
- semantic type,
- scrollable content,
- fixed action dock,
- explicit close / scan-again control.

## H5 — Action running

Example:
- Bridge registration.

Visible:
- result panel remains,
- triggering command enters running/disabled state,
- shared progress feedback is visible,
- unrelated HUD controls remain responsive unless explicitly blocked.

## H6 — Action success

Visible:
- success feedback,
- result panel may remain open,
- user decides next navigation.

No automatic close unless a future command explicitly defines it.

## H7 — Recoverable error

Visible:
- warning/error feedback with clear message,
- retry/action if available,
- persistent status may indicate degraded feature/system state.

## H8 — Feature disabled

Example:
- QR recognition disabled.

Visible:
- QR status icon absent,
- QR menu row shows Aus,
- QR-specific active recognition behavior is stopped/disabled.

## H9 — Deep navigation

Example future path:
`System → Verbindung → Bridge`

Rules:
- one branch at a time,
- explicit Back,
- path/context visible,
- same component model as all other menu branches.


## H10 — HUD scale setting

Path:
`System → Anzeige → HUD-Größe`

Visible:
- slider,
- 50% minimum,
- 100% default/current reference,
- 150% maximum,
- live preview through launcher/status rail size.

Rules:
- affects persistent launcher/menu button and status rail only,
- result/detail panels are unchanged,
- minimum interaction hit targets remain preserved,
- value persists as a display preference,
- changing scale does not affect feature/runtime state.


## H11 — GNSS active / valid fix

Visible:
- GNSS enabled,
- compact healthy GNSS icon in status rail,
- no permanent coordinate text.

## H12 — GNSS enabled / no fix

Visible:
- GNSS remains visible in the rail,
- waiting/no-fix treatment.

Detail:
- Ein,
- receiver connected when applicable,
- Positionsqualität: Kein Fix.

## H13 — GNSS enabled / disconnected or degraded

Visible:
- warning/degraded GNSS status icon,
- selected source/device remains visible in detail,
- no silent fallback to another positioning source.
