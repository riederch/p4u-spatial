# Development

## Requirements

- Node.js 22 or newer
- npm

## Install

```bash
npm install
```

## Start the bridge

```bash
P4U_ADMIN_KEY=change-me npm run dev:bridge
```

Default development storage:

```text
.data/
├── state/
└── repository/
```

The default repository provider is the filesystem reference backend.

To use a GitHub or Gitea repository as the authoritative backend, configure the generic Git remote provider:

```bash
export P4U_REPOSITORY_PROVIDER=git
export P4U_GIT_REMOTE_URL=https://git.example.invalid/owner/spatial-data.git
export P4U_GIT_BRANCH=main
export P4U_GIT_USERNAME=p4u-spatial
export P4U_GIT_TOKEN=...
```

The bridge keeps the credentials server-side, clones the configured branch into `P4U_REPOSITORY_ROOT`, refreshes from `origin`, commits repository mutations locally and pushes them with non-force Git semantics. GitHub and Gitea therefore use the same provider path; the protocol does not depend on either vendor API.

## Scanner simulator

In another terminal:

```bash
export P4U_ADMIN_KEY=change-me
npm run dev:sim -- pair
npm run dev:sim -- device
npm run dev:sim -- upload-demo
```

The simulator uses the admin key only to automate the human approval step for development. A real headset never receives the admin key.

After `upload-demo` a committed scan appears below:

```text
.data/repository/spatial/raw/scans/<scan-id>/
├── manifest.json
├── trajectory.jsonl
└── _commit.json
```

## Verify

```bash
npm run typecheck
npm test
```

## Current scope

The filesystem provider remains the deterministic local reference backend. GitHub and Gitea are supported through the generic Git remote `RepositoryProvider`; provider-specific REST APIs are intentionally not part of the Spatial contract.


## Federation reference route

A bridge can expose one configured upstream Spatial provider as a federated route:

```bash
export P4U_FEDERATION_UPSTREAM_URL=https://upstream.example.invalid
export P4U_FEDERATION_TOKEN=...
export P4U_FEDERATION_ROUTE_ID=upstream
```

If no token is configured, the route uses `anonymous` upstream access. With a token it uses `service` access.

The bridge preserves the upstream `sourceId` and `operationId`. Read results are cached with delivery provenance, and writes to an unavailable upstream are durably retained with state `relay-durable` until a later retry reaches a terminal upstream state.
