# ADR 0019: Reusable QR Reader Feature

Status: Accepted

Date: 2026-09-21

## Context

The PICO scanner needs QR recognition for device and Bridge workflows, but QR scanning is a
general interaction capability rather than Bridge-specific business logic.

The feature must support ordinary QR content such as URLs, email addresses, telephone/SMS URIs,
geographic locations, Wi-Fi payloads, contacts, JSON and plain text. Applications also need to
contribute domain-specific actions, such as registering a P4U Spatial Bridge.

A scanner implementation, content interpretation, result presentation and application action are
different responsibilities and must not become one PICO-specific code path.

## Decision

QR reading is implemented as a reusable application feature with a small public API.

The QR feature owns:

- scan lifecycle and result state,
- QR decoding and content classification,
- standard actions,
- result presentation semantics,
- registration of application-provided custom actions.

Application-specific behavior is added through pluggable actions. The QR feature must not know the
Bridge pairing implementation.

Scanning and executing an action are separate user interactions. A successful scan presents the
decoded result first; it does not automatically execute a URL, pairing request or other side effect.

Long QR payloads are displayed in a scrollable content region while the action area remains
available independently of content length.

## Consequences

- QR reading can be reused by future PICO applications without copying Bridge logic.
- Bridge registration is one custom QR action rather than a scanner special case.
- New content types and actions can be added without modifying the camera backend.
- Scanner backends can change without changing the public content/action model.
- Applications must explicitly register domain-specific actions.
- Hardware-specific scan behavior is kept outside the reusable content/action layer.

## Implementation anchors

- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrReaderController.kt` — reusable scan lifecycle, result state and pluggable action boundary.
- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrModels.kt` — generic QR content and action contracts.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/BridgeRegistrationQrAction.kt` — Bridge pairing implemented as an application-provided custom QR action.

## Related decisions

- ADR 0013: XR Is a Profile over Core
- ADR 0020: SecureMR QR Scanner Backend
- ADR 0021: XR Control and Status HUD

## Reconciliation note

As of 2026-09-21 the reusable scan lifecycle, content classification and pluggable action model are implemented in `qr-reader`. The result presentation is still rendered by the product `app` composition layer rather than a reusable feature-owned presentation component. This does not change the public QR action model, but it remains a modularization gap tracked together with ADR 0022.
