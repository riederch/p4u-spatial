# Spatial Artifacts v0.1

Dependencies: Core v0.1 and Spatial.

Artifacts are source-scoped immutable binary resources used by Spatial objects, relations or domain payloads.

Typical examples:

- photos,
- PDFs,
- GLB models,
- scan-derived meshes,
- point-cloud files,
- other binary evidence.

Artifacts are not embedded into normal feature/list responses.

## Identity

An artifact is identified by:

```text
(sourceId, artifactId)
```

`artifactId` is opaque to clients.

An Artifact Reference also carries integrity/type metadata where known.

## Immutability

A committed artifact's bytes MUST be immutable.

Changing the binary content creates a new artifact identity.

This makes cached artifact content safe to verify and prevents an old observation or feature from silently referring to different bytes later.

## Descriptor

A descriptor includes at least:

- sourceId,
- artifactId,
- mediaType,
- byte size,
- SHA-256,
- createdAt,
- links.

Providers MAY add filename, title, provenance, thumbnails or domain metadata.

## Read

Conceptual endpoints:

```http
GET /spatial/v1/sources/{sourceId}/artifacts/{artifactId}
GET /spatial/v1/sources/{sourceId}/artifacts/{artifactId}/content
```

The descriptor response SHOULD provide content links rather than require clients to construct the content URL.

Large content SHOULD support HTTP range requests where practical.

Normal HTTP caching/ETag semantics SHOULD be used.

## Upload

A provider advertising `spatial.artifacts.write` supports a retry-safe upload session.

Conceptual flow:

```http
POST /spatial/v1/sources/{sourceId}/artifact-uploads
PUT  /spatial/v1/sources/{sourceId}/artifact-uploads/{uploadId}/content
POST /spatial/v1/sources/{sourceId}/artifact-uploads/{uploadId}/commit
GET  /spatial/v1/sources/{sourceId}/artifact-uploads/{uploadId}
```

The create request contains a client-generated `uploadId` plus declared:

- sha256,
- size,
- mediaType,
- optional filename.

Retrying the same uploadId with identical metadata MUST return/resume the same logical upload.

Reusing the uploadId with different metadata MUST return `ARTIFACT_UPLOAD_ID_CONFLICT`.

## Commit

Commit succeeds only after the complete content is durably stored and verified against declared size and SHA-256.

The commit response returns the final Artifact Descriptor.

Only a committed artifact may be referenced by an authoritative Spatial operation that requires it.

If the bytes are missing or not yet committed, the dependent operation returns `ARTIFACT_NOT_READY`.

## Provider deduplication

A provider MAY deduplicate artifacts internally by SHA-256.

That implementation detail MUST NOT change the externally stable Artifact Reference.

Two users/sources having identical bytes does not imply that authorization for one grants access to the other.

## Federation

A federated route may expose artifact read/write only when it advertises the respective capability.

A durable relay may acknowledge a Spatial operation referencing artifacts as `relay-durable` only if every artifact payload required for eventual upstream delivery is itself durably available to the relay or already committed at the authoritative source.

Caching an artifact never transfers source authority to the relay.

## Authorization

Artifact authorization follows the source/route/principal context.

Knowledge of a SHA-256 is never by itself authorization to retrieve content.

## Relevant capabilities

- `spatial.artifacts.read`
- `spatial.artifacts.write`

## Relevant errors

- `ARTIFACT_NOT_FOUND`
- `ARTIFACT_NOT_READY`
- `ARTIFACT_UPLOAD_ID_CONFLICT`
- `HASH_MISMATCH`
- `PAYLOAD_TOO_LARGE`
