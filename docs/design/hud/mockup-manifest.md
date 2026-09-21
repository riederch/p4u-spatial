# Unified XR HUD Mockup Manifest

Derived from ADR 0029 and the HUD design specification.

The first mockup round must contain the following views using one consistent visual language.

## M01 — Idle HUD

Purpose:
- validate peripheral quietness,
- validate launcher and status placement.

State:
- QR enabled,
- launcher collapsed,
- one QR icon in status rail,
- passthrough/XR workspace remains visually dominant.

## M02 — Root menu

Purpose:
- validate menu expansion and shell language.

State:
- launcher open,
- root menu visible,
- category: Erkennung,
- QR status remains on right.

## M03 — Recognition submenu

Purpose:
- validate hierarchical navigation and toggle control.

State:
- path: Erkennung,
- row: QR-Code-Erkennung,
- toggle: Ein,
- explicit Back.

## M04 — QR result: short URL

Purpose:
- validate standard result panel and action dock.

Content:
- semantic type WEB,
- short URL,
- actions: Öffnen, Kopieren,
- secondary action: Neu scannen,
- close affordance.

## M05 — QR result: long payload

Purpose:
- validate long-data readability.

Content:
- long JSON/plain-text payload,
- visibly scrollable content area,
- action dock fixed while body scrolls.

## M06 — Custom action running

Purpose:
- validate feature/application custom action consistency.

Content:
- QR payload representing Bridge registration,
- action dock includes Bridge registrieren,
- running state,
- shared progress feedback: Bridge wird registriert …,
- other destructive duplicate action prevented while running.

## M07 — Feature disabled

Purpose:
- validate one authoritative feature state.

State:
- QR toggle Aus,
- QR status icon absent,
- no scan affordance presented as active.

## M08 — Error / degraded state

Purpose:
- validate warning/error language.

State:
- a recoverable QR/Bridge action error,
- compact error feedback,
- Retry action,
- status/degraded treatment consistent with HUD design system.

## Rendering rules

All mockups:

- first-person XR perspective,
- neutral passthrough-style background,
- no decorative sci-fi cockpit,
- translucent restrained surfaces,
- consistent corner radii and typography,
- launcher lower-left,
- status rail right,
- central result panels spatially readable,
- German UI labels,
- no scan frame or QR corner overlay.

The mockups are concept validation artifacts, not screenshots of the final PICO rendering.


## M09 — HUD size setting

Purpose:
- validate discoverability and live scaling of peripheral HUD chrome.

State:
- path: System → Anzeige,
- row: HUD-Größe,
- slider visible,
- range labels: 50%, 100%, 150%,
- current value: 100%,
- launcher and right status rail visibly respond to the setting,
- central result/detail panel sizing remains unchanged.


## GNSS extension mockups

### M10 — Idle HUD with QR + GNSS

Purpose:
- validate multiple active features in the peripheral rail,
- validate the shell with a real second feature.

State:
- QR enabled,
- GNSS enabled with valid fix,
- QR and GNSS icons visible,
- no permanent coordinate text.

### M11 — Positioning / GNSS detail

State:
- path: Positionierung → GNSS,
- toggle: Ein,
- source: Garmin GLO 2,
- device/connection: Verbunden,
- position quality as secondary value.

### M12 — GNSS no-fix / degraded

State:
- GNSS remains enabled,
- no valid fix or disconnected,
- waiting/warning rail treatment,
- detail explains the state,
- no silent source fallback.
