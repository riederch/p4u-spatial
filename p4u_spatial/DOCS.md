# P4U Spatial 0.0.1

Version 0.0.1 runs the actual P4U Spatial Bridge inside Home Assistant.

## Network

The bridge listens on:

```text
TCP 8787
```

A basic runtime check is available at:

```text
http://<home-assistant-host>:8787/health
```

Core discovery is available at:

```text
http://<home-assistant-host>:8787/.well-known/open-spatial-interop
```

## Persistent storage

Home Assistant provides `/data` as persistent app storage.

P4U Spatial uses:

```text
/data/state       persistent bridge identity/session state
/data/repository  local spatial repository backend
```

The bridge's configured spatial root is:

```text
spatial/
```

inside the repository directory.

## Options

### source_title

Human-readable title of the local Spatial Source.

Default:

```text
P4U Spatial
```

### admin_key

Optional key for the current bridge administration endpoints.

If left empty, the administration API remains disabled. Set a sufficiently long random value before using device pairing administration.

## Updating to 0.0.1

Version 0.0.1 is distributed as the pre-built image:

```text
ghcr.io/riederch/p4u-spatial-ha:0.0.1
```

The image is published manually through the repository's **Publish Home Assistant App** GitHub Actions workflow.

The GHCR package must be public so Home Assistant can pull it without GitHub credentials.

## Current scope

This is still an early development version.

It does not yet expose a Home Assistant ingress UI and does not yet connect to external Git providers automatically.
