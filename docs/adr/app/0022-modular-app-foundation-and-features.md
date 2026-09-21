# ADR 0022: Modular App Foundation and Features

Status: Accepted

Date: 2026-09-21

## Context

The PICO application is gaining independent capabilities such as QR recognition, persistent HUD
controls and future spatial tools. Wiring each capability directly into the application class would
turn the composition root into a growing collection of feature-specific state, settings and runtime
logic.

The application needs a stable base system that can expose common mechanisms while concrete
features remain independently evolvable and may use different runtime/vendor backends.

## Decision

The headset application is split into a feature-independent foundation, feature modules and
optional hardware/vendor backend modules.

The dependency direction is:

```text
app (composition root)
 ├─ app-core
 ├─ feature modules
 │   └─ optional vendor/backend modules
 └─ platform UI/runtime dependencies

feature modules -> app-core
app-core -X-> feature modules
feature A -X-> feature B
```

### app-core

`app-core` owns generic mechanisms needed by multiple features, including:

- feature contracts and stable feature identity,
- feature registration,
- aggregation/observation of feature state,
- generic metadata used to project hierarchical menu entries,
- generic metadata used to project active-function status indicators.

The foundation MUST NOT contain QR, Bridge registration, SecureMR or other feature-specific
behavior.

### Feature modules

A feature module owns its domain behavior, feature state and feature-specific services/UI contracts.

Features expose themselves to the foundation through `AppFeature`. A feature may declare:

- stable id and title,
- whether it can be enabled/disabled,
- hierarchical menu path,
- optional status-icon key,
- observable current state.

Features do not depend on one another. Cross-feature collaboration must go through an explicit
shared service/contract in the foundation or another deliberately shared module.

### Application module

`app` is the composition root. It selects which features are shipped, creates them and registers
them in `FeatureRegistry`.

The application shell may render generic menu/HUD projections from registry snapshots, but it must
not maintain duplicate feature state.

### Vendor backends

Hardware/runtime-specific integrations remain below the feature boundary. For example, QR is a
feature while PICO SecureMR is one QR scanner backend.

## Consequences

- Adding a feature does not require adding its state model to the base system.
- Menu and status HUD can be generated from registered feature metadata.
- Features can be removed or replaced without changing `app-core`.
- Vendor-specific implementations remain replaceable below a feature boundary.
- Shared services must be intentionally promoted to the foundation rather than copied between
  features.
- The application module remains responsible for dependency composition, so it still knows which
  concrete features ship in the product.

## Implementation anchors

- `clients/pico-scanner/app-core/src/main/java/at/p4u/picovr/core/feature/AppFeature.kt` — feature contract and observable snapshot model.
- `clients/pico-scanner/app-core/src/main/java/at/p4u/picovr/core/feature/FeatureRegistry.kt` — feature-independent registration/state aggregation.
- `clients/pico-scanner/qr-reader/src/main/java/at/p4u/picovr/qr/QrFeature.kt` — QR implemented as the first concrete feature.
- `clients/pico-scanner/app/src/main/java/at/p4u/spatial/scanner/MainApplication.kt` — thin composition root registering shipped features.
- `clients/pico-scanner/settings.gradle.kts` — explicit Gradle module boundary.

## Related decisions

- ADR 0019: Reusable QR Reader Feature
- ADR 0020: SecureMR QR Scanner Backend
- ADR 0021: XR Control and Status HUD
