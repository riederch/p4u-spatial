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

## Configuration architecture

The target architecture is **web-managed configuration** as defined by ADR 0018.

Repository, federation, RCHKB, Spatial, XR, limits and credentials are operator-facing Bridge settings and belong in the Bridge web UI with persistent Bridge-owned storage. Home Assistant options and Docker environment variables are not a second application configuration model.

The `P4U_*` environment variables still documented in this file are part of the current transitional implementation. They remain documented so the existing development build can be operated, but they MUST NOT be expanded with new operator-facing settings. As the web configuration store replaces them, this section should shrink rather than grow.

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


## RCHKB repository profile

RCHKB is integrated as a profile over the generic repository provider rather than as a vendor-specific storage backend. Git remains an implementation detail and RCHKB remains the source of truth.

Example for a Gitea-hosted RCHKB knowledge base:

```bash
export P4U_REPOSITORY_PROVIDER=git
export P4U_REPOSITORY_PROFILE=rchkb
export P4U_GIT_REMOTE_URL=https://gitea.example.invalid/owner/rchkb.git
export P4U_GIT_BRANCH=main
export P4U_GIT_USERNAME=p4u-spatial
export P4U_GIT_TOKEN=...
export P4U_RCHKB_ROOT='Feuerwehr/Pogoeriach'
```

The selected knowledge-base root is projected from:

```text
<RCHKB_ROOT>/_agents/spatial/model/
├── buildings.jsonl
├── floors.jsonl
├── rooms.jsonl
├── assets.jsonl
├── landmarks.jsonl
└── relations.jsonl
```

Only files that exist are exposed as collections. This matches the RCHKB rule that each subject-specific knowledge base owns its local `_agents/spatial/` projection.

Direct P4U Spatial writes are **disabled by default** for the RCHKB profile. RCHKB's human-readable canonical pages, histories and primary sources remain authoritative; changing only the derived Spatial projection would bypass that workflow. An installation may explicitly enable direct projection writes with:

```bash
export P4U_RCHKB_ALLOW_SPATIAL_WRITES=true
```

That opt-in should only be used where an external workflow also maintains the canonical RCHKB knowledge and provenance. Normal RCHKB knowledge changes should be applied through the RCHKB workflow first and then reflected in the local Spatial projection.

## XR scan upload resource limits and staging retention

The bridge bounds authenticated XR scan ingestion to protect persistent state from accidental or hostile oversized uploads:

```bash
export P4U_SCAN_MAX_FILES=256
export P4U_SCAN_MAX_FILE_BYTES=67108864
export P4U_SCAN_MAX_TOTAL_BYTES=536870912
export P4U_SCAN_UPLOAD_RETENTION=604800
```

The total-size limit is enforced from declared file sizes; clients should therefore include `size` for every scan file. Individual uploaded files are always bounded independently and, when `size` is present, the bridge verifies the exact byte count in addition to SHA-256.

Incomplete server-side staging older than the retention period can be removed through the admin endpoint:

```text
POST /api/v1/admin/xr/scans/cleanup
```

Cleanup affects only incomplete data below the bridge state directory. It never deletes committed raw scans from the repository and does not alter the headset's durable offline outbox. A headset that still owns an outbox item can therefore restart the upload after server staging has expired.
