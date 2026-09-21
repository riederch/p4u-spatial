# ADR 0031: HUD-controlled ambient feature lifecycle

Status: Accepted

Date: 2026-09-21

## Context

ADR 0029 established the Unified XR HUD as the primary control surface, but the first QR implementation still retained a legacy feature-home interaction:

- a visible primary application surface,
- an explicit "QR scannen" button,
- separate idle/scanning/error screens,
- an explicit "Neu scannen" action after a result.

That interaction duplicates the HUD and contradicts the intended ambient XR model. QR recognition is not a foreground tool that the user repeatedly launches. It is a persistent capability that should run while enabled and otherwise stay visually silent.

The initial implementation attempted to realize this with PICO Spatial SDK 6.x SpatialML. Real PICO 4 Ultra validation later showed that the target PICO OS 5.15.9.U runtime does not provide the Spatial-container runtime required by that SDK. ADR 0032 therefore changes the platform mechanism to native OpenXR/SecureMR while preserving the lifecycle defined here.

## Decision

P4U Spatial models QR recognition, and comparable future always-available capabilities, as **HUD-controlled ambient features**.

### Single control authority

The HUD menu is the only persistent configuration surface for QR recognition:

```text
Erkennung
└── QR-Code-Erkennung
    └── Ein / Aus
```

There is no additional QR home page, start button, scan button or feature-specific settings screen.

### Runtime lifecycle

When QR recognition is enabled:

- recognition starts automatically,
- recognition continues without a visible scan UI,
- the feature remains visually represented only by its active status icon,
- disabling the feature stops/gates camera and decode work.

When QR recognition is disabled, no scanner runtime is started merely because the application is open.

### Result lifecycle

The first valid QR payload wins and temporarily pauses recognition.

A recognized payload opens the standard HUD result/detail surface.

While a result is open:

- no second QR result may replace or stack on top of it,
- no action executes automatically,
- explicit standard/custom actions remain available.

When the result is closed, recognition resumes automatically if QR remains enabled.

There is no separate `Neu scannen` command in the normal QR result flow because resuming recognition is implicit in closing the result.

### Error behavior

Scanner errors do not create a feature home screen.

Errors use the shared HUD feedback/status model. Recoverable initialization/runtime failures may be retried with bounded backoff while the feature remains enabled. Repeated failure must remain visible as degraded/error state rather than creating an invisible infinite retry loop.

### Single OpenXR application runtime

The product QR flow must not launch a second visible Android/NativeActivity for scanning.

For PICO 4 Ultra / PICO OS 5.x, PICO SecureMR camera access is integrated into the same native OpenXR application lifecycle that owns HUD rendering and input. The existing NativeActivity sample code is the validated implementation source, not a separate product screen.

### Application surface

The application does not render a feature-specific white/home content surface merely to host an ambient feature.

Persistent user-visible surfaces are:

- Unified HUD launcher/navigation/status,
- shared transient feedback,
- explicit result/detail surfaces when content exists.

On the PICO 4 Ultra target these are OpenXR composition/content layers per ADR 0032 rather than a PICO Spatial SDK root window.

## Consequences

- Enabling QR is sufficient to make QR recognition active.
- The HUD is the only configuration model for the ambient QR capability.
- Normal operation has no visible scanner screen or scan affordance.
- QR recognition behaves like a background XR capability instead of a foreground app page.
- Result handling remains explicit and safe; recognition never auto-executes QR actions.
- The QR backend must support lifecycle control inside the product's OpenXR runtime.
- Hardware validation must verify camera/readback support and lifecycle behavior on the target PICO runtime.

## Implementation anchors

- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrScannerBackend.kt` — vendor-neutral scanner lifecycle contract.
- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrReaderController.kt` — authoritative ambient start/stop, first-result latch and automatic resume after result close.
- `clients/pico-scanner/securemr-probe/cpp/readback_qr.cpp` — validated native PICO SecureMR/OpenXR camera/readback implementation to be integrated into the main runtime.
- `clients/pico-scanner/qr-reader-ui/src/main/java/at/p4u/picovr/qr/ui/QrFeaturePresentation.kt` — existing product semantics/presentation contract; its Spatial-UI renderer is superseded by the OpenXR presentation adapter.
- ADR 0032 defines the target PICO runtime and migration boundary.

## Implementation status

The **product lifecycle** in this ADR is implemented in the platform-neutral QR controller and HUD contracts.

The former PICO Spatial SDK 6.1.9 presentation/backend implementation compiled in CI but failed physical PICO 4 Ultra runtime validation because required Spatial runtime classes are absent on the target PICO OS 5.15.9.U.

Therefore the following are currently migration work, not completed hardware functionality:

- OpenXR HUD rendering of the existing semantic HUD model,
- in-process native SecureMR lifecycle controlled by the QR feature toggle,
- OpenXR result/detail placement,
- controller and controller-free hand interaction parity on real hardware.

## Relationship to existing decisions

ADR 0032 supersedes the SpatialML/Spatial-application **mechanism** previously described here. It does not supersede this ADR's ambient feature behavior.

- ADR 0019 — Reusable QR Reader Feature
- ADR 0020 — SecureMR QR Scanner Backend
- ADR 0022 — Modular App Foundation and Features
- ADR 0029 — Unified XR HUD Interaction Shell
- ADR 0032 — PICO 4 Ultra Runtime Uses Native OpenXR
