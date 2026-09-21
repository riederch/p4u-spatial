# ADR 0029: Unified XR HUD Interaction Shell

Status: Accepted

Date: 2026-09-21

## Context

P4U Spatial currently has the architectural pieces for a persistent XR control surface:

- ADR 0021 defines a lower-left hierarchical menu and right-side active-function status area,
- ADR 0022 defines a modular feature system with a feature-neutral foundation,
- ADR 0019 defines QR result/action semantics,
- PICO Spatial UI provides viewpoint-following Augment surfaces for persistent field-of-view UI.

The current model is still feature-oriented: menu, status and feature presentation are separate
concepts and a feature may provide a visually independent presentation.

The intended product direction is stronger: all persistent application control should feel like one
coherent HUD system. Features contribute capabilities and state, while the HUD owns navigation,
control presentation, status presentation, progress, notifications, contextual actions and the
visual language used by result panels.

The HUD must remain unobtrusive in the user's field of view, scale to future features, and preserve
the existing feature-module boundaries.

## Decision

P4U Spatial adopts a single **Unified XR HUD Interaction Shell** as the primary control surface of
the headset application.

The HUD is infrastructure, not a feature.

Features contribute metadata, commands, state and optional content/presentation adapters. They do
not create independent persistent control chrome.

### 1. HUD zones

The shell defines five conceptual zones.

#### Launcher

A compact launcher is persistently available near the lower-left edge of the visible field.

The launcher:

- opens/closes the HUD menu,
- remains visually quiet while closed,
- does not expose feature-specific styling,
- stays available across viewpoint changes.

#### Navigation panel

Opening the launcher reveals one hierarchical navigation panel.

The navigation panel:

- expands inward/upward from the launcher region,
- renders categories and entries from registered feature/system contributions,
- supports explicit back navigation,
- uses one consistent row/toggle/action component model,
- shows current state directly rather than requiring a second status screen,
- never opens multiple competing persistent menus.

Only one navigation branch is active at a time.

#### Status rail

A compact vertical status rail is persistently available near the right edge of the visible field.

The rail shows only information that benefits from continuous visibility, including:

- enabled persistent features,
- degraded/error state for those features,
- important system connectivity/synchronization state when applicable.

Inactive healthy features are omitted unless their visibility is explicitly required by a system
status contribution.

Selecting a status item may open the corresponding HUD detail/control context, but status state
itself is read-only projection of authoritative runtime state.

#### Transient feedback layer

Short-lived feedback is presented through a unified toast/progress surface rather than feature
specific banners.

This layer is used for:

- action started/completed/failed,
- background progress,
- recoverable warnings,
- short confirmations.

Transient feedback must not obscure the navigation launcher or active status rail.

#### Result / detail panels

Feature results and detailed content use a common HUD panel language, even when the panel itself is
spatial/world-locked rather than head-following.

A result/detail panel has a standard structure:

1. header: title, optional type/status, close control,
2. scrollable content body,
3. optional secondary metadata/status region,
4. fixed action dock,
5. optional progress/error feedback associated with the panel.

Feature-specific content may render inside the body, but the surrounding chrome and action
hierarchy are owned by the HUD design system.

### 2. Field-of-view behavior

Persistent launcher, navigation and status surfaces are viewpoint-following HUD chrome.

On PICO Spatial UI the reference implementation uses platform-native `Augment` surfaces with
`followViewpoints = ViewPoint.All` or an equivalent platform-supported viewpoint-following
mechanism.

Large result/detail panels are not required to be head-locked. They may be spatial/world-locked
where that improves readability and comfort.

The shell therefore distinguishes:

- **persistent HUD chrome** — viewpoint-following and compact,
- **working content** — spatial/world-locked when appropriate,
- **transient feedback** — viewpoint-following but short-lived.

### 3. Feature contribution model

A feature contributes declarative HUD metadata rather than drawing its own persistent controls.

At minimum a feature may contribute:

- stable feature ID,
- localized title,
- hierarchical navigation path,
- enabled/disabled state when toggleable,
- active/degraded/error status,
- status icon key,
- commands/actions,
- optional result/detail presentation adapter.

The HUD consumes the same authoritative feature state used by runtime behavior.

There MUST NOT be a second HUD-only feature state.

### 4. Command model

HUD actions are explicit commands.

Commands declare:

- stable command ID,
- localized label,
- semantic role: primary, secondary, destructive or passive,
- availability/enabled state,
- optional progress state,
- execution result.

A command never executes merely because content was detected or displayed.

Long-running commands surface progress through the unified feedback model.

Destructive or security-sensitive commands require explicit confirmation.

### 5. Navigation model

Navigation is hierarchical and contribution-driven.

The initial required feature paths are:

```text
Erkennung
└── QR-Code-Erkennung
    └── Ein / Aus

Positionierung
└── GNSS
    └── Ein / Aus
```

The GNSS path is contributed only when the optional GNSS feature is installed/registered.

Future categories may include connection, spatial tools and system functions, but a category appears
only when at least one installed/registered contribution belongs to it.

The root navigation structure is therefore derived from registered contributions and not hard-coded
to a fixed product feature list.

### 6. QR integration

QR remains a reusable feature per ADR 0019.

Its HUD integration follows these rules:

- QR recognition can be enabled/disabled from the hierarchical HUD menu.
- The active QR icon appears in the status rail only while QR recognition is enabled.
- QR recognition itself has no visible scan frame or corner markers.
- The first valid recognized QR result ends that recognition event.
- Recognition never auto-executes a URL, pairing action or other side effect.
- The recognized content appears in a standard result/detail panel.
- The content body is scrollable.
- The action dock remains fixed and available for long payloads.
- Standard actions and application-provided custom actions use the same HUD command components.
- Bridge registration remains a custom action and not QR-core behavior.

### 7. GNSS integration

External GNSS is an optional feature defined by ADR 0030.

- GNSS contributes under `Positionierung → GNSS`.
- Disabled GNSS does not show a normal active status icon.
- Valid fix shows healthy/active status.
- Enabled without a valid fix or with a lost connection remains visible as waiting/degraded.
- Detailed coordinates and quality diagnostics belong in a detail surface, not permanent rail text.
- GNSS source/provenance remains explicit; source fallback must not appear transparent.

### 8. Visual design system

The HUD uses one visual system for launcher, navigation, status, feedback and result-panel chrome.

The architecture standardizes semantic design tokens rather than fixed pixel values inside this ADR.

Token groups include:

- surface/material roles,
- opacity/blur roles,
- spacing scale,
- corner-radius scale,
- icon sizes,
- typography roles,
- focus/hover/pressed states,
- primary/secondary/destructive action roles,
- success/warning/error/inactive status roles,
- animation durations/easing.

Concrete values live in the derived HUD design specification so visual refinement does not require a
new architecture decision.

### 9. Interaction consistency

HUD components must support the platform interaction methods available to the application without
changing information architecture.

At minimum the model must remain compatible with controller/ray interaction and focus-based
navigation. Gaze, hand or other platform input may be added through adapters.

Focus state must always be visually distinguishable.

Important actions must not depend on color alone.

### 10. Information density and comfort

Persistent HUD chrome is intentionally sparse.

- Closed launcher occupies minimal field-of-view area.
- Status rail uses compact symbols rather than text labels by default.
- Navigation text appears only while the menu is open.
- Long textual data belongs in result/detail panels, never in persistent status chrome.
- Animation must avoid constant motion in peripheral vision.
- Persistent surfaces must not chase head motion with visibly unstable lag.

Exact field-of-view offsets and sizes require physical PICO validation.

A user-adjustable **peripheral HUD scale** is supported as a display preference:

- default: 100%,
- allowed range: 50% to 150%,
- reference step: 5%,
- affects the persistent launcher/menu button and status rail presentation,
- does not scale result/detail panels or working content,
- is exposed under a non-primary display/settings path rather than persistent HUD chrome,
- must preserve a safe minimum interaction hit target even when the visual scale is reduced.

This preference is presentation-only and MUST NOT create a second feature/runtime state.

### 11. Modularity boundary

The Unified HUD belongs to shared app UI infrastructure.

`app-core` remains UI- and vendor-neutral.

Feature modules MUST NOT depend on each other to integrate with the HUD.

A feature-specific presentation adapter may depend on the feature and shared HUD UI contracts, but
the generic HUD shell MUST NOT import feature-specific types such as QR result models.

The application module remains the composition root that selects installed features and product
specific actions.

## State model

The HUD itself has a small state model independent of feature domain state:

```text
Collapsed
Open(path)
Feedback(message/progress)
```

Result/detail panels have their own presentation state and may coexist with the collapsed HUD.

Opening the HUD must not pause unrelated enabled background features.

Closing the HUD must not disable a feature.

Feature state transitions are owned by the feature/runtime system; the HUD only invokes commands and
projects the resulting authoritative state.

## Consequences

- All persistent application control has one coherent interaction and visual model.
- Adding a feature adds contributions, not new persistent chrome.
- QR and future features can share result/action/progress components.
- The HUD shell becomes a stable UX contract between app infrastructure and feature modules.
- Large results remain readable because they are not forced into peripheral head-locked chrome.
- More shared UI infrastructure is required than the current menu/status prototype.
- Hardware validation remains mandatory for field-of-view placement, focus behavior, comfort and
  viewpoint-following stability.

## Alternatives considered

### Independent feature UI

Each feature could provide its own menu, status and result styling.

Rejected because it scales poorly, duplicates interaction state and produces an inconsistent XR
experience.

### Everything head-locked

All content, including long results, could remain attached to the user's field of view.

Rejected because persistent large panels create unnecessary visual obstruction and are less
comfortable for reading.

### Fixed hard-coded main menu

The app could define a static list of product features.

Rejected because it conflicts with ADR 0022 and makes feature installation/removal a shell change.

## Derived design artifacts

If this ADR is accepted, the normative architecture is elaborated by:

- `docs/design/hud/hud-spec.md`
- `docs/design/hud/hud-states.md`
- `docs/design/hud/hud-tokens.json`
- `docs/design/hud/mockup-manifest.md`

Those files may evolve during visual refinement without changing this ADR as long as they preserve
the architecture and interaction invariants above.

The first visual direction derived from these artifacts was reviewed and accepted on 2026-09-21.

## Relationship to existing decisions

This ADR supersedes ADR 0021. Its authoritative-state, hierarchical-menu, active-status and
viewpoint-following requirements are carried forward and generalized here.

It complements, and does not supersede:

- ADR 0019 — Reusable QR Reader Feature
- ADR 0020 — SecureMR QR Scanner Backend
- ADR 0022 — Modular App Foundation and Features
- ADR 0024 — Headset Offline State, Durable Outbox and Secure Credentials
- ADR 0030 — Optional External GNSS Positioning Feature
