# Home Assistant App Release

The Home Assistant app is published as a pre-built multi-architecture image.

## Image

```text
ghcr.io/riederch/p4u-spatial-ha:<version>
```

Supported architectures:

- amd64
- aarch64

The app version in `p4u_spatial/config.yaml` is the authoritative release version.

## Current published release

As of 2026-09-19, the published Home Assistant app remains:

```text
0.0.1
```

Publication workflow run:

```text
35389004829
```

Published multi-architecture image:

```text
ghcr.io/riederch/p4u-spatial-ha:0.0.1
```

Published digest:

```text
sha256:1dee65ad46a1338e62ad0a9e01707a233bdb4075a91911b84780c5d33512d648
```

The earlier `404 manifest unknown` condition occurred before this tag existed and is no longer the known blocker.

The repository does **not** yet contain a confirmed smoke-test result from the target Home Assistant installation showing that 0.0.1 started successfully. Do not bump to 0.0.2 merely to probe this; obtain a concrete startup log or smoke-test failure first.

Development on `main` may advance independently. `ha-release` remains the deliberate publication pointer and must not be moved merely because `main` changed.

## On-demand publishing

Publishing is intentionally not tied to normal `main` pushes.

The dedicated branch:

```text
ha-release
```

acts as the release pointer.

Moving `ha-release` to a commit triggers exactly one Home Assistant image publication for the app version contained in that commit.

This keeps normal development pushes free of GitHub Actions usage.

The workflow can also still be started manually with `workflow_dispatch`.

## Published images

A successful run publishes:

```text
ghcr.io/riederch/amd64-p4u-spatial-ha:<version>
ghcr.io/riederch/aarch64-p4u-spatial-ha:<version>
ghcr.io/riederch/p4u-spatial-ha:<version>
ghcr.io/riederch/p4u-spatial-ha:latest
```

## GHCR visibility

The generic multi-architecture image must be readable by Home Assistant.

After the first package publication, verify in GitHub package settings that the package visibility/authentication matches the Home Assistant installation. Public visibility is preferred for a public app repository.

## Home Assistant update

After publishing:

1. Reload the custom app repository in Home Assistant.
2. Confirm the new P4U Spatial version is shown.
3. Install/update the app.
4. Start it.

## Smoke test

Expected startup log:

```text
Starting P4U Spatial <version>
Bridge API listening on port 8787
Persistent state: /data/state
Spatial repository: /data/repository
```

Then verify:

```http
GET http://<home-assistant-host>:8787/health
```

Expected body:

```json
{
  "status": "ok",
  "repository": "filesystem"
}
```

Core discovery:

```http
GET http://<home-assistant-host>:8787/.well-known/open-spatial-interop
```

The discovery document should advertise at least:

- `core`
- `spatial`
- `xr`

and the instance role:

```text
content-provider
```

## Release rule

Do not bump the Home Assistant app version for ordinary protocol/documentation changes.

Bump `p4u_spatial/config.yaml` only when a new app image should be published, then move `ha-release` to that commit.
