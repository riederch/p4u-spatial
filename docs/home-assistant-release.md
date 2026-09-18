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

## Publish

Publishing is intentionally manual to avoid consuming GitHub Actions quota on every push.

In GitHub:

1. Open **Actions**.
2. Select **Publish Home Assistant App**.
3. Choose **Run workflow** on `main`.
4. Wait for both architecture builds and the manifest job to finish.

The workflow publishes:

```text
ghcr.io/riederch/amd64-p4u-spatial-ha:<version>
ghcr.io/riederch/aarch64-p4u-spatial-ha:<version>
ghcr.io/riederch/p4u-spatial-ha:<version>
ghcr.io/riederch/p4u-spatial-ha:latest
```

## GHCR visibility

The multi-architecture image must be readable by Home Assistant without GitHub credentials.

After the first package publication, verify in GitHub package settings that the package is **Public**.

If the package is private, Home Assistant will fail while pulling the image even though the app repository itself is visible.

## Home Assistant update

After publishing:

1. Reload the custom app/add-on repository in Home Assistant.
2. P4U Spatial should show version `0.0.1`.
3. Install/update the app.
4. Start it.

## Smoke test

Expected log start:

```text
Starting P4U Spatial 0.0.1
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

Bump `p4u_spatial/config.yaml` only when a new app image should be published.
