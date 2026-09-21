# PICO app-core

`app-core` is the feature-independent foundation of the P4U Spatial headset application.

It owns shared application mechanisms such as feature registration and feature-state aggregation.
It MUST NOT depend on concrete features or PICO vendor backends.

Dependency direction:

```text
app -> app-core
app -> feature modules
feature modules -> app-core
feature modules -> optional vendor/backend modules
```

Concrete features expose themselves through `AppFeature`. The application bootstrap registers the
available features in `FeatureRegistry`; menu and HUD projections consume registry snapshots
instead of hard-coding individual feature state.

ADR: `docs/adr/app/0022-modular-app-foundation-and-features.md`
