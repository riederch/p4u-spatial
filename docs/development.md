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

The filesystem provider is the deterministic reference backend. Gitea and GitHub providers implement the same `RepositoryProvider` contract next.
