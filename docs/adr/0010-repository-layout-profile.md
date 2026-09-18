# ADR 0010: Repository Layout Is a Backend Profile

Status: accepted

## Decision

The existing `raw/model/display` repository layout remains valid for Git-backed spatial repositories but is not a requirement of the open interoperability protocol.

## Consequences

RCHKB/Gitea/GitHub adapters may use the repository layout.

Fire may use Common_Asset/Common_Gis/EAV/SQL internally.

Both can implement the same public Spatial contract.

The existing repository-layout document will later move under a Git repository profile without changing its storage semantics.
