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
