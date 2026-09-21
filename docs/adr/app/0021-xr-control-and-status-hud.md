# ADR 0021: XR Control and Status HUD

Status: Accepted

Date: 2026-09-21

## Context

P4U Spatial is gaining runtime features that can be enabled or disabled while the user remains in
the XR environment. These controls should not consume the primary spatial content window and the
user needs a compact indication of which persistent functions are active.

The first such function is QR recognition, but the interaction model must support additional
features without adding unrelated buttons to the main application content.

## Decision

Persistent runtime controls and active-function indicators are modeled as an XR HUD separate from
application result/content windows.

The HUD has two conceptual regions:

- a menu entry point at the lower-left of the visible field,
- a compact active-function status area at the right side of the visible field.

The menu is hierarchical. Its first setting is `QR-Code-Erkennung` with an explicit on/off state.

The status area displays symbols only for functions that are currently active. When QR recognition
is enabled, a QR symbol is visible; when disabled, the QR symbol is absent.

Feature state has one authoritative setting per feature. Menu controls, status indicators and the
underlying runtime capability observe the same state; the HUD must not maintain a second visual-only
copy of feature state.

HUD controls are head-locked interaction chrome. Spatial result windows remain separate and may be
world/spatial UI as appropriate.

## Consequences

- New runtime features can add menu entries and status symbols without redesigning the main content
  window.
- Users can see active background capabilities without opening the menu.
- The HUD must remain visually restrained because it occupies persistent field-of-view space.
- Feature settings require observable state so runtime behavior and status indicators stay in sync.
- The current in-window status prototype is transitional until the control/status UI is hosted by
  the head-locked XR HUD layer.

## Implementation anchors

- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrRecognitionSettings.kt` — authoritative persistent/observable QR feature state shared by controls and indicators.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/MainApplication.kt` — current status-indicator projection; transitional until the head-locked HUD hosts it.

## Related decisions

- ADR 0019: Reusable QR Reader Feature
- ADR 0020: SecureMR QR Scanner Backend
