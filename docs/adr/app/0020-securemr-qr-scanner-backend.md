# ADR 0020: SecureMR QR Scanner Backend

Status: Superseded by ADR 0031

Date: 2026-09-21

> Superseded by ADR 0031 for the product scanner lifecycle and in-process SpatialML integration. The vendor-isolation, first-valid-decode and ephemeral-frame principles remain valid.

## Context

The first P4U Spatial XR implementation targets PICO 4 Ultra. On the currently validated PICO OS
and Spatial SDK combination, the Java SpatialML API does not provide the required camera readback
path for the QR workflow.

PICO SecureMR exposes the required camera access through native OpenXR extensions and supports CPU
readback of RGB frames. The application must use this capability without making SecureMR part of
the public QR feature contract.

## Decision

PICO SecureMR/OpenXR is a vendor-specific QR scanner backend behind the reusable QR reader feature.

The backend is responsible for:

- PICO camera permission and SecureMR lifecycle,
- native OpenXR/SecureMR camera acquisition,
- RGB frame readback,
- delivery of frames to the decoder,
- stopping or gating camera/decode work when QR recognition is disabled.

The public QR feature must not expose SecureMR, native OpenXR activity details or PICO-specific
identifiers.

The first valid decoded QR payload wins. After a valid decode, the scan session ends and control
returns to the reusable result flow. This behavior intentionally supports QR codes shown on mobile
displays or objects that are not perfectly stationary.

Raw camera frames are ephemeral and are not persisted as part of normal scanner operation.

No visible scan frame, corner markers or artificial region-of-interest overlay is required. QR
recognition operates directly on the available camera image.

## Consequences

- The required PICO camera path is available without contaminating the generic QR API.
- A future Android CameraX, another XR runtime or another vendor backend can implement the same
  scanner role.
- PICO-specific native code remains an implementation dependency of the PICO client.
- Hardware validation remains required for camera orientation, image quality and decode reliability.
- Disabling QR recognition can stop unnecessary SecureMR/decode work rather than merely hiding UI.

## Implementation anchors

- `clients/pico-scanner/securemr-probe/src/main/java/com/bytedance/pico/secure_mr_demo/readback/ReadbackActivity.java` — Java-side SecureMR scan lifecycle, decode latch and ephemeral frame handoff.
- `clients/pico-scanner/securemr-probe/cpp/readback_qr.cpp` — native PICO SecureMR/OpenXR camera acquisition and CPU readback backend.

## Related decisions

- ADR 0013: XR Is a Profile over Core
- ADR 0019: Reusable QR Reader Feature

## Reconciliation note

The module dependency was reconciled during the 2026-09-21 audit: `qr-reader` now uses `securemr-probe` as an internal Gradle `implementation` dependency rather than exposing it through `api`.

The software boundary now matches this ADR. Real-device decode reliability, orientation/image quality and end-to-end PICO hardware validation remain required and are not implied by code/CI completion.
