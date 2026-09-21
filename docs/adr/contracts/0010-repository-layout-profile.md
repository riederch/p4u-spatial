# ADR 0010: Repository Layout Is a Backend Profile

Status: accepted

## Decision

The existing `raw/model/display` repository layout remains valid for Git-backed spatial repositories but is not a requirement of the open interoperability protocol.

## Consequences

RCHKB/Gitea/GitHub adapters may use the repository layout.

Fire may use Common_Asset/Common_Gis/EAV/SQL internally.

Both can implement the same public Spatial contract.

The existing repository-layout document will later move under a Git repository profile without changing its storage semantics.

## Implementation anchors

- `protocol/profiles/git-repository.md` — raw/model/display layout is explicitly an optional Git backend profile.
- `bridge/src/repository/provider.ts` — public repository abstraction does not leak into protocol contracts.
- `bridge/src/repository/filesystem.ts` — filesystem backend.
- `bridge/src/repository/git-remote.ts` — generic Git remote backend.

## Reconciliation note

The decision is implemented. Historical text mentioning Gitea/GitHub should be read as provider examples; the current code intentionally uses one generic Git-remote provider abstraction.
