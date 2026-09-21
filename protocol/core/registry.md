# Protocol Registry v0.1

This document defines the stable machine identifiers used by the draft protocol family.

## Protocol family and discovery

Human-readable family name:

```text
Open Interoperability Protocol
```

Draft machine identifier:

```text
open-spatial-interop
```

Well-known discovery endpoint:

```http
GET /.well-known/open-spatial-interop
```

The machine identifier is intentionally implementation-neutral and is not a product name.

## Contract identifiers

Canonical contract keys are lower-case kebab-case:

- `core`
- `spatial`
- `tiles`
- `federation`
- `app-sync`
- `xr`
- `xr-app`

Implementations MUST NOT invent aliases such as `appSync` in discovery documents.

## Roles

Initial instance roles:

- `content-provider`
- `federation-provider`
- `account-provider`

Roles are descriptive. They are not authorization grants.

An implementation with no applicable role MAY publish an empty role array and rely on its advertised contracts.

## Capability namespace

Capabilities describe implementation/route support.

Canonical v0.1 names include:

### Core

- `core.me`

### Spatial

- `spatial.read`
- `spatial.snapshots`
- `spatial.create`
- `spatial.update`
- `spatial.delete`
- `spatial.capture`
- `spatial.artifacts.read`
- `spatial.artifacts.write`
- `spatial.relations.read`
- `spatial.relations.write`

### Tiles

- `tiles.read`
- `tiles.offline-plan`

### Federation

- `federation.read`
- `federation.cache`
- `federation.durable-relay`
- `federation.delegated-user`

### App Sync

- `app-sync.read`
- `app-sync.write`
- `app-sync.blobs`
- `app-sync.devices`
- `app-sync.history`
- `app-sync.restore`

### XR

- `xr.pairing`
- `xr.device`
- `xr.display.read`
- `xr.scan.write`
- `xr.observation.write`
- `xr.task.read`
- `xr.task.answer`

### XR App

- `xr-app.update`

Unknown capabilities MUST be tolerated by clients.

## Scope namespace

Scopes describe principal authorization rather than implementation support.

Where the action is identical, scopes SHOULD reuse the same canonical string as the capability, for example:

- `spatial.read`
- `spatial.update`
- `spatial.artifacts.read`
- `tiles.read`
- `app-sync.write`
- `xr.scan.write`

An implementation MAY define additional narrower scopes, but such extensions MUST use a collision-resistant namespace.

## Legacy P4U XR scopes

The original bridge used:

- `display:read`
- `scan:write`
- `observation:write`
- `task:read`
- `task:answer`

The P4U reference implementation accepts these as legacy aliases.

Newly issued authorizations SHOULD use the canonical `xr.*` names.

Wire responses intended for the open contract SHOULD report canonical names.
