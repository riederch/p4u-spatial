# ADR 0031: HUD-controlled ambient feature lifecycle

Status: Accepted

Date: 2026-09-21

## Context

ADR 0029 established the Unified XR HUD as the primary control surface, but the first QR
implementation still retained a legacy feature-home interaction:

- a visible primary application surface,
- an explicit "QR scannen" button,
- separate idle/scanning/error screens,
- an explicit "Neu scannen" action after a result.

That interaction duplicates the HUD and contradicts the intended ambient XR model. QR recognition
is not a foreground tool that the user repeatedly launches. It is a persistent capability that
should run while enabled and otherwise stay visually silent.

The PICO reference stack also provides SpatialML SecureMR/readback APIs that can operate inside the
same Spatial application runtime. A separate scanner NativeActivity is therefore not part of the
desired product interaction.

## Decision

P4U Spatial models QR recognition, and comparable future always-available capabilities, as
**HUD-controlled ambient features**.

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

When QR recognition is disabled, no scanner runtime is started merely because the application is
open.

### Result lifecycle

The first valid QR payload wins and temporarily pauses recognition.

A recognized payload opens the standard HUD result/detail surface.

While a result is open:

- no second QR result may replace or stack on top of it,
- no action executes automatically,
- explicit standard/custom actions remain available.

When the result is closed, recognition resumes automatically if QR remains enabled.

There is no separate `Neu scannen` command in the normal QR result flow because resuming recognition
is implicit in closing the result.

### Error behavior

Scanner errors do not create a feature home screen.

Errors use the shared HUD feedback/status model. Recoverable initialization/runtime failures may be
retried with bounded backoff while the feature remains enabled. Repeated failure must remain visible
as degraded/error state rather than creating an invisible infinite retry loop.

### Single Spatial application runtime

The product QR flow must not launch a separate visible Android/NativeActivity for scanning.

PICO SecureMR camera access is integrated in-process through the SpatialML SecureMR/readback APIs
behind the existing vendor backend boundary.

The legacy native OpenXR `ReadbackActivity` implementation may remain temporarily as historical or
fallback development code during migration, but it must not be invoked by the normal product QR
flow.

### Application surface

The application does not render a feature-specific white/home content surface merely to host an
ambient feature.

Persistent user-visible surfaces are:

- Unified HUD launcher/navigation/status,
- shared transient feedback,
- explicit result/detail surfaces when content exists.

The framework root container may still exist as required by PICO Spatial UI, but it must remain
visually neutral/transparent when no working content is present.

## Consequences

- Enabling QR is sufficient to make QR recognition active.
- The HUD is the only configuration model for the ambient QR capability.
- Normal operation has no visible scanner screen or scan affordance.
- QR recognition behaves like a background XR capability instead of a foreground app page.
- Result handling remains explicit and safe; recognition never auto-executes QR actions.
- The QR backend must support lifecycle control inside the existing Spatial application runtime.
- Hardware validation must verify camera/readback support and lifecycle behavior on the target PICO
  runtime before the legacy NativeActivity path is removed.

## Implementation anchors

- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrScannerBackend.kt` — vendor-neutral scanner lifecycle contract.
- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrReaderController.kt` — authoritative ambient start/stop, first-result latch and automatic resume after result close.
- `clients/pico-scanner/securemr-probe/src/main/java/at/p4u/picovr/securemr/SpatialMlQrScannerBackend.kt` — in-process PICO SpatialML SecureMR/readback implementation.
- `clients/pico-scanner/qr-reader-ui/src/main/java/at/p4u/picovr/qr/ui/QrFeaturePresentation.kt` — no-home-surface QR presentation; result panel only when a QR result exists.
- `clients/pico-scanner/app-ui/src/main/java/at/p4u/picovr/ui/PicoFeatureShell.kt` — transparent root content surface plus persistent HUD chrome.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/MainApplication.kt` — composition root injects the PICO scanner backend into the reusable QR feature.

## Implementation status

The software migration is implemented and CI-green with PICO Spatial SDK 6.1.9:

- no QR home/start/scan surface,
- QR toggle directly controls runtime recognition,
- recognition is visually silent while scanning,
- result close automatically resumes recognition while the feature remains enabled,
- normal product flow no longer launches `ReadbackActivity`,
- PICO camera access/readback runs in-process through SpatialML,
- root content chrome no longer paints the previous white/gray feature screen.

Physical PICO 4 Ultra validation remains required for real camera permission behavior, VST readback,
decode reliability, result placement and runtime lifecycle.

## Relationship to existing decisions

This ADR supersedes ADR 0020's NativeActivity/native-OpenXR integration choice while preserving its
vendor-backend boundary, first-valid-decode rule and ephemeral-frame requirements.

- ADR 0019 — Reusable QR Reader Feature
- ADR 0020 — SecureMR QR Scanner Backend (superseded integration mode)
- ADR 0022 — Modular App Foundation and Features
- ADR 0029 — Unified XR HUD Interaction Shell
