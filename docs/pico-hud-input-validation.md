# PICO HUD input validation

Status: hardware validation required

Target device:

- PICO 4 Ultra
- PICO OS `5.15.9.U`
- application package `at.p4u.spatial.scanner`

Related architecture:

- `docs/adr/app/0029-unified-xr-hud-interaction-shell.md`
- `docs/adr/app/0032-pico4-ultra-native-openxr-runtime.md`

## Validated native runtime baseline

Hardware run on 2026-09-21 established the following baseline on PICO 4 Ultra / PICO OS
`5.15.9.U`:

- the application boots as a native OpenXR VR application rather than a Spatial SDK AppPanel;
- the PICO OpenXR runtime exposes the SecureMR/readback extensions used by the application;
- the application session reaches READY/SYNCHRONIZED and becomes the focused XR client;
- the SecureMR framework, tensor and pipeline are created successfully;
- CAMERA permission is granted;
- 512x512 RGB readback reaches the application continuously;
- the sampled run remains stable at approximately 90 FPS without an application crash.

This baseline validates the native OpenXR/SecureMR bootstrap only. It does not validate HUD
interaction, controller ray behavior, hand input or QR decoding.

## Purpose

This checklist validates the unified HUD interaction contract on real hardware.

The application has one information architecture and one semantic command model. Controller and hand
input must operate the same controls and produce the same application state transitions. Passing one
input mode does not imply that the other mode is validated.

The validation is intentionally split into:

1. controller-only operation,
2. controller-free hand operation,
3. seamless input-source switching.

## Preconditions

Before input validation:

- install the debug APK produced from the current `main`;
- confirm the application starts as the native OpenXR VR application;
- confirm the OpenXR/SecureMR bootstrap completes without a fatal exception;
- confirm the launcher/menu HUD composition layer is visible;
- confirm the persistent HUD uses VIEW-space head locking rather than LOCAL/STAGE placement;
- leave QR recognition disabled unless a QR-specific test explicitly enables it.

If the head-locked HUD itself is not working, stop this test and investigate HUD anchoring first.

## Controller-only checklist

Use the PICO controllers as the only interaction source.

- [ ] Point at the launcher with the controller ray.
- [ ] Hover/focus feedback is visible before activation.
- [ ] Open the launcher with the controller trigger.
- [ ] Navigate into `Erkennung`.
- [ ] Navigate into `QR-Code-Erkennung`.
- [ ] Toggle QR recognition on.
- [ ] Toggle QR recognition off again.
- [ ] Navigate back through the hierarchy.
- [ ] Open `System -> Anzeige`.
- [ ] Change `HUD-Größe` with the controller.
- [ ] Verify values snap to the configured 5% steps.
- [ ] Verify reducing visual HUD scale does not make controls impractical to target.
- [ ] If a result/detail panel is available, scroll its content with controller interaction.
- [ ] Activate every available result action with the controller.
- [ ] Activate `Schließen` and verify the result panel closes.
- [ ] No action fires merely because a control is hovered/focused.
- [ ] Disabled/running commands cannot be activated.
- [ ] No controller interaction changes an unrelated feature state.

Controller validation passes only if the complete available HUD workflow is operable without using
hand input.

## Hand-only checklist

Put both controllers aside so they are no longer used as the active interaction source. Use only
PICO hand tracking.

- [ ] Hands are detected by the PICO system.
- [ ] The HUD remains visible and unchanged when controllers are not used.
- [ ] Target the launcher using the hand interaction offered by the system.
- [ ] Hover/focus feedback is visible before activation where the platform exposes hover/focus.
- [ ] Open the launcher using hand/finger interaction.
- [ ] Navigate into `Erkennung`.
- [ ] Navigate into `QR-Code-Erkennung`.
- [ ] Toggle QR recognition on.
- [ ] Toggle QR recognition off again.
- [ ] Navigate back through the hierarchy.
- [ ] Open `System -> Anzeige`.
- [ ] Change `HUD-Größe` using hands only.
- [ ] Verify values still snap to 5% steps.
- [ ] Verify controls remain targetable at reduced visual HUD scale.
- [ ] If a result/detail panel is available, scroll its content using hands only.
- [ ] Activate every available result action using hands only.
- [ ] Activate `Schließen` using hands only.
- [ ] No action fires from merely pointing at or touching the vicinity of a control.
- [ ] Disabled/running commands cannot be activated.
- [ ] No hand interaction changes an unrelated feature state.

Record which platform gesture is actually provided on PICO OS `5.15.9.U` for each successful
interaction, for example hand ray + pinch, direct pinch, or poke. Do not assume an interaction kind
solely from SDK documentation.

Hand validation passes only if the complete available HUD workflow can be completed without picking
up a controller.

## Seamless switching checklist

This test verifies that input source is not application mode.

- [ ] Open the HUD with a controller.
- [ ] Navigate one or more levels into the menu.
- [ ] Put the controller aside.
- [ ] Continue the same open menu with hands without returning to the root.
- [ ] Change a setting with hands.
- [ ] Resume interaction with the controller.
- [ ] Current menu path is preserved.
- [ ] Current setting/feature state is preserved.
- [ ] Open a result/detail panel.
- [ ] Interact with the panel using one input source.
- [ ] Switch input source while the panel remains open.
- [ ] Result content and action state are preserved.
- [ ] No duplicate activation occurs during an input-source transition.
- [ ] No explicit Controller/Hand mode selector is required.

## Interaction parity matrix

Record each row independently.

| Operation | Controller | Hands | Notes / observed hand gesture |
| --- | --- | --- | --- |
| Launcher open/close | [ ] | [ ] | |
| Category navigation | [ ] | [ ] | |
| Back navigation | [ ] | [ ] | |
| Feature toggle | [ ] | [ ] | |
| HUD-size slider | [ ] | [ ] | |
| Result scrolling | [ ] | [ ] | |
| Result command | [ ] | [ ] | |
| Result close | [ ] | [ ] | |
| Disabled-command blocking | [ ] | [ ] | |
| Input-source switch without state loss | [ ] | [ ] | |

## Failure classification

When an item fails, classify it before changing architecture:

- **platform input failure** — PICO/OpenXR does not expose the expected hand/controller interaction;
- **OpenXR action/binding failure** — an interaction profile is active but an action or suggested
  binding does not produce the expected pose/value;
- **composition-layer hit-test failure** — the HUD is rendered but its OpenXR ray/direct-interaction
  hit test does not reach the semantic control;
- **renderer/control failure** — a specific native HUD control does not respond;
- **hit-target/comfort failure** — interaction technically works but target geometry is unsuitable;
- **application state failure** — the control activates but causes the wrong semantic state change;
- **input-transition failure** — switching source loses state or causes duplicate activation.

Capture a device log for platform, action/binding, composition-layer or renderer failures.

Do not introduce a separate hand-only menu or duplicate feature state as a workaround.

## Acceptance

Controller support may be marked hardware-validated when the controller-only checklist passes.

Hand/finger fallback may be marked hardware-validated only when the hand-only checklist passes on
the target PICO 4 Ultra with the recorded OS version.

Unified input parity may be marked hardware-validated only after the seamless-switching checklist and
the complete interaction parity matrix pass.
