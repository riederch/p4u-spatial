# ADR 0032: PICO 4 Ultra Runtime Uses Native OpenXR

Status: Accepted

Date: 2026-09-21

## Context

The target headset is a PICO 4 Ultra running PICO OS 5.15.9.U.

The application was temporarily migrated to PICO Spatial SDK 6.1.9 in order to obtain:

- a Mixed `DefaultStage`,
- HMD/camera-relative `AttachmentPanel` HUD surfaces,
- Spatial UI controls,
- an in-process SpatialML/SecureMR camera path.

That implementation compiles and is CI-green, but real-device validation shows that the target
runtime does not provide the system-side classes required by the PICO Spatial SDK container model.

Observed on the target device:

- the launcher activity is still created by PICO OS as a normal 1600x900 `AppPanel` virtual display;
- `com.spatial.app.SpatialContainerInfo` is missing and causes a fatal
  `NoClassDefFoundError` during `SpatialApp` initialization;
- `com.pico.spatial.foundation.extensions.applog.StatisticsReporter` is missing;
- `com.bytedance.pico.openmr.spatial.pack.SSMRConnection` remains missing;
- the OpenXR runtime itself is present and reports the PICO 4-series controller interaction profile.

The repository already contains a PICO native OpenXR/SecureMR implementation derived from the
official SecureMR readback sample. This path has previously reached:

- OpenXR instance/session creation,
- PICO SecureMR framework creation,
- camera pipeline execution,
- CPU RGB readback,
- Java/JNI frame delivery.

The pinned native sample also already contains the primitives needed for the product shell:

- `XR_REFERENCE_SPACE_TYPE_VIEW` support,
- a head-locked `XrCompositionLayerQuad`,
- controller action sets and tracked controller poses,
- alpha-blended mixed-reality projection,
- PICO SecureMR in the same OpenXR session.

## Decision

The PICO 4 Ultra / PICO OS 5.x product runtime uses **native OpenXR** as its headset platform layer.

PICO Spatial SDK 6.x is not a production runtime dependency for this target.

### 1. Application entry point

The headset application must boot into the native OpenXR runtime rather than
`SpatialLaunchActivity` / `Application.launch { DefaultStage { ... } }`.

There remains exactly one APK.

The existing native SecureMR code is integrated into that APK and must not require a separately
installed helper package.

### 2. HUD placement

Persistent HUD chrome is rendered as OpenXR composition layers relative to a VIEW reference space.

This replaces the Spatial-SDK-specific camera-target implementation while preserving the product
requirement from ADR 0029:

- launcher/menu/status/feedback = head locked,
- result/detail/working content = world placed when appropriate.

The initial implementation may use one or more `XrCompositionLayerQuad` surfaces.

World-placed panels use LOCAL or STAGE reference space rather than VIEW space.

### 3. UI/domain boundary

ADR 0022 and ADR 0029 remain authoritative for feature and HUD semantics.

The following remain platform-neutral and must not be rewritten around OpenXR:

- feature IDs and authoritative feature state,
- menu contribution model,
- command model,
- feedback model,
- QR classification/actions,
- optional GNSS feature semantics.

Only the PICO presentation/input adapter changes.

The Spatial-UI-specific implementation in `app-ui` may be replaced or isolated behind a
PICO/OpenXR presentation implementation.

### 4. Input

Controller and hand input continue to target the same semantic HUD controls.

Native OpenXR is the input abstraction boundary.

Controller support uses OpenXR action sets and controller aim/pose actions.

Hand/finger fallback uses supported OpenXR hand capabilities on the target runtime.

Real-device validation on PICO 4 Ultra / PICO OS 5.15.9.U confirms that the runtime exposes:

- `XR_BD_controller_interaction`,
- `XR_EXT_hand_interaction`,
- `XR_EXT_hand_tracking`.

The product input adapter must not depend exclusively on the runtime's current interaction profile.

Real-device validation shows that PICO OS `5.15.9.U` can keep
`/interaction_profiles/bytedance/pico4s_controller` current even while system gesture input is
active. Therefore:

- controller input continues to use the PICO 4S OpenXR action bindings;
- `XR_EXT_hand_interaction` may contribute profile-driven bindings where the runtime activates them;
- baseline controller-free hand interaction uses direct `XR_EXT_hand_tracking` as the reliable
  fallback;
- Palm tracking supplies the hand pointer pose;
- Thumb Tip to Index Tip distance supplies semantic pinch activation with hysteresis;
- active direct hand tracking may override a stale-but-valid controller aim pose;
- when hand joints become inactive, controller actions resume without an application-level mode
  switch.

Both sources still feed the same semantic HUD controls and application state.

No separate hand-only menu or duplicate feature state is allowed.

### 5. SecureMR / QR

The proven native `XR_PICO_secure_mixed_reality` path is the camera backend for PICO OS 5.x.

The QR scanner remains ambient:

- no scanner home screen,
- no scan button,
- no red frame or corner overlay,
- QR enabled/disabled from the unified HUD,
- first valid result pauses recognition,
- closing the result resumes recognition if the feature remains enabled.

SecureMR and the HUD should share the same OpenXR lifecycle rather than switching to a second visible
activity.

### 6. Android-backed HUD surfaces

If the target OpenXR runtime exposes `XR_KHR_android_surface_swapchain`, Android-rendered HUD
content may be hosted on an OpenXR quad through the returned Android `Surface`.

This is preferred if it lets the existing declarative HUD presentation be retained without making
Android window placement authoritative.

Support for this extension must be confirmed on real hardware before it becomes a hard requirement.

If it is unavailable, the OpenXR HUD renderer must render the same semantic HUD model natively.

### 7. Compatibility guard

The application must fail gracefully when required OpenXR capabilities are unavailable.

It must not attempt to initialize PICO Spatial SDK containers on PICO OS 5.x.

CI success against Spatial SDK artifacts is not evidence of target-runtime compatibility.

## Consequences

- The fatal `SpatialContainerInfo` dependency is removed from the target runtime path.
- Head locking is implemented with a standard OpenXR VIEW space instead of an OS-6 Spatial Stage.
- The already validated SecureMR path can remain in-process and in the same APK.
- Controller input is hardware-validated through the PICO 4S interaction profile.
- Hand input is hardware-validated through direct `XR_EXT_hand_tracking`; the runtime can activate
  and deactivate valid joint data as PICO switches between gesture and controller input.
- `XR_EXT_hand_interaction` remains enabled as an optional profile-driven path but is not relied on
  as the sole hand-input mechanism on PICO OS `5.15.9.U`.
- Some current `app-ui` PICO Spatial UI code becomes a superseded implementation rather than the
  target presentation layer.
- Migration is incremental: first restore a stable native OpenXR bootstrap, then move HUD rendering,
  input parity and result placement onto it.

## Supersedes / clarifies

This ADR supersedes only the **PICO Spatial SDK runtime mechanism** described by ADR 0029 and ADR
0031 for the PICO 4 Ultra / PICO OS 5.x target.

It does not supersede their product behavior, information architecture, feature lifecycle or HUD
semantics.

ADR 0020 remains valid and its native SecureMR/OpenXR implementation becomes the preferred PICO OS
5.x backend.
