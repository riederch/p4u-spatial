# Unified XR HUD Implementation Plan

Derived from:
- ADR 0029 — Unified XR HUD Interaction Shell
- HUD design specification
- HUD state catalogue
- HUD design tokens
- Mockup manifest

Status: Planning baseline

## Goal

Replace the current feature-oriented shell with one coherent HUD system while preserving the
existing modular app architecture.

The implementation must remain incremental and keep the app buildable after each phase.

## Phase 0 — Baseline and guardrails

Before UI implementation:

- keep ADR 0029 and derived HUD artifacts as the source of truth,
- keep `app-core` UI/vendor neutral,
- keep feature modules independent,
- do not move feature domain state into HUD/UI state,
- do not introduce a second authoritative feature-enabled state,
- preserve current QR behavior:
  - no scan frame,
  - first valid QR wins,
  - no automatic side-effect action,
  - custom actions remain pluggable.

Acceptance:
- ADR traceability check remains green,
- no feature-specific imports enter generic HUD core.

## Phase 1 — HUD contracts

Introduce shared HUD contracts in app UI infrastructure.

Required abstractions:

- `HudContribution`
- `HudMenuContribution`
- `HudStatusContribution`
- `HudCommand`
- `HudCommandRole`
- `HudCommandState`
- `HudFeedback`
- `HudPanelPresentation`
- `HudSettings`

Feature modules contribute declarative metadata and adapters.

The generic shell must not import QR-specific models.

Acceptance:
- QR can describe menu/status/actions through contracts,
- no visible behavior change required yet,
- app composition remains thin.

## Phase 2 — Design tokens and component primitives

Create shared HUD component primitives using the accepted design tokens.

Components:

- HUD surface/material,
- launcher button,
- navigation panel,
- category row,
- toggle row,
- command button,
- back/header row,
- status icon container,
- feedback toast/progress surface,
- result/detail panel chrome,
- fixed action dock,
- standard scroll container.

Token values must come from one shared source in code rather than being copied between components.

Acceptance:
- one visual language across all primitives,
- focus/pressed/disabled/running states implemented,
- minimum XR hit target preserved.

## Phase 3 — Unified navigation shell

Replace the current ad-hoc FeatureMenu rendering with the unified navigation model.

Behavior:

- lower-left launcher,
- single open navigation branch,
- contribution-driven category tree,
- explicit back navigation,
- authoritative toggle binding,
- launcher closes menu and resets path.

Initial required path:

```text
Erkennung
└── QR-Code-Erkennung
    └── Ein / Aus
```

Acceptance:
- no category appears without a contribution,
- closing/opening menu never changes feature state,
- QR toggle changes the same runtime state used by QR recognition.

## Phase 4 — Unified status rail

Replace feature-specific status container behavior with the generic status contribution model.

Behavior:

- right-side vertical rail,
- active/relevant statuses only,
- QR icon visible only while QR recognition is enabled,
- degraded/error status can override normal active status,
- optional select action opens relevant detail/navigation context.

Acceptance:
- status is read-only projection,
- no shadow state,
- QR off removes active QR status.

## Phase 5 — Viewpoint-following HUD placement

Move launcher/navigation/status to independent PICO Spatial UI Augments.

Use:

```text
followViewpoints = ViewPoint.All
```

or the equivalent SDK-supported mechanism.

Separate:
- persistent viewpoint-following HUD chrome,
- world/spatial working panels,
- transient viewpoint-following feedback.

Acceptance in CI:
- debug APK builds with PICO Spatial SDK 6.1.9.

Hardware acceptance:
- launcher remains reachable,
- status rail remains readable,
- no uncomfortable follow lag/jitter,
- offsets do not interfere with peripheral visibility.

Hardware validation must remain explicitly open until tested on PICO 4 Ultra.

## Phase 6 — Unified feedback layer

Add shared feedback/progress behavior.

Support:

- info,
- success,
- warning,
- error,
- running/progress.

Rules:

- passive success may auto-dismiss,
- actionable errors remain until resolved/dismissed,
- feedback does not obscure launcher/status,
- features do not create independent toast styles.

Acceptance:
- QR custom action running/success/failure uses shared feedback.

## Phase 7 — Unified result/detail panel

Create standard spatial result/detail panel shell.

Structure:

1. fixed header,
2. scrollable content,
3. optional metadata/status section,
4. fixed action dock,
5. associated feedback/progress.

Migrate QR result UI into this shell.

Acceptance:
- short URL case,
- long JSON/text case,
- standard actions,
- custom Bridge registration action,
- action dock remains fixed during scrolling,
- no automatic action execution.

## Phase 8 — HUD settings

Add display/settings contribution:

```text
System
└── Anzeige
    └── HUD-Größe
```

Peripheral HUD scale:

- default: 100%,
- range: 50%–150%,
- step: 5%,
- applies to launcher/menu button and status rail,
- does not scale result/detail/working content,
- persists as a display preference,
- minimum hit target remains protected.

Implementation recommendation:

- store one presentation setting, e.g. `peripheralHudScalePercent`,
- derive visual scale from the setting,
- keep hit-target container at or above minimum size independently of visual scale.

Acceptance:
- live visual preview,
- restart persistence,
- 50/100/150 boundary tests,
- no feature/runtime state change.

## Phase 9 — Remove legacy shell paths

After the unified HUD is functionally equivalent:

- remove old FeatureMenu implementation paths,
- remove old standalone status rendering paths,
- remove QR-specific result chrome that has moved to the shared result panel,
- update ADR implementation anchors,
- update reconciliation baseline.

Acceptance:
- no duplicate shell implementation,
- no parallel HUD system remains.

## Phase 10 — Hardware validation

Validate on PICO 4 Ultra.

### Placement

Check:
- lower-left launcher at 50%, 100%, 150%,
- right status rail at 50%, 100%, 150%,
- menu expansion against FOV boundaries,
- result panel reading position.

### Interaction

Check:
- controller/ray focus,
- select/press,
- back navigation,
- slider interaction,
- long-scroll content,
- repeated QR action flow.

### Comfort

Check:
- viewpoint-following stability,
- peripheral distraction,
- panel opacity against bright/dark passthrough,
- readability,
- animation comfort.

### Runtime

Check:
- QR recognition while menu closed,
- QR recognition while menu open,
- QR disable stops active recognition behavior,
- feature state/status remains synchronized,
- no camera frame/overlay persistence.

## Test strategy

### Host/unit tests

- menu tree generation,
- command state mapping,
- feature/status projection,
- HUD scale clamping and persistence,
- hit-target preservation,
- result panel action/state behavior.

### Compose/UI tests where practical

- navigation open/close,
- hierarchy/back,
- toggle dispatch,
- disabled/running command states,
- result action dock persistence.

### Build validation

Every implementation phase must keep:

- TypeScript/schemas/tests green,
- PICO debug APK green,
- ADR traceability green.

## ADR/code traceability

When implementation begins:

- generic HUD contracts/components reference ADR 0029,
- QR adapter references ADR 0019 + ADR 0029 where relevant,
- modular boundaries continue to reference ADR 0022,
- PICO viewpoint-following adapter references ADR 0029 and vendor-specific implementation details.

ADR 0029 implementation anchors should be added only as each architectural boundary actually exists.

## Non-goals for the first implementation

Do not add merely because the mockup illustrates them:

- arbitrary battery/Wi-Fi/cloud status unless backed by actual feature/system contributions,
- decorative sci-fi elements,
- hard-coded future menu categories,
- hand tracking unless separately implemented,
- configurable result-panel scale tied to peripheral HUD scale,
- automatic QR actions.

## Recommended implementation order

```text
HUD contracts
→ tokens/primitives
→ navigation
→ status
→ viewpoint placement
→ feedback
→ result panel
→ QR migration
→ HUD scale setting
→ cleanup
→ hardware validation
```

This order minimizes architecture churn and keeps visual work on top of stable contracts.
