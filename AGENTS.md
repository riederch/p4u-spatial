# Agent Rules

These rules apply to the whole repository.

## Scope

P4U Spatial is public software. Do not add private site data, credentials, real repository tokens, or RCHKB-specific knowledge to this repository.

## Architecture invariants

- The PICO 4 Ultra never receives Gitea or GitHub credentials.
- Pairing and device authorization are handled by the bridge.
- Gitea and GitHub are equal repository providers behind one interface.
- Raw scanner data, canonical model data and headset display data are separate layers.
- Raw data is preserved and must not be silently rewritten by agents.
- The canonical model is provider- and device-independent.
- Display data is generated and may be rebuilt from the canonical model.
- Headset cache is disposable; headset outbox is durable until acknowledged by the bridge.
- Spatial uncertainty, provenance and coordinate-frame transforms must be explicit.
- Site-specific paths must be configurable. Never hard-code RCHKB paths.

## Changes

When adding protocol fields or schemas:
1. preserve backward compatibility where practical,
2. document breaking changes,
3. update examples and protocol docs,
4. never invent certainty for unresolved spatial mappings.
