import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import type { RepositoryProvider } from "../repository/provider.js";
import { atomicWrite, newId, nowIso, resolveBelow, sha256, stableStringify } from "../util.js";

interface ArtifactUploadRequest {
  uploadId: string;
  sha256: string;
  size: number;
  mediaType: string;
  filename?: string;
}

interface ArtifactUploadSession {
  sourceId: string;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
  request: ArtifactUploadRequest;
}

interface ArtifactMetadata {
  sourceId: string;
  artifactId: string;
  sha256: string;
  size: number;
  mediaType: string;
  filename?: string;
  createdAt: string;
}

export interface ArtifactDescriptor extends ArtifactMetadata {
  links: Array<{ rel: string; href: string; type?: string }>;
}

export interface ArtifactUploadStatus {
  uploadId: string;
  sourceId: string;
  state: "created" | "uploading" | "uploaded" | "committed";
  artifactId?: string;
  updatedAt: string;
  descriptor?: ArtifactDescriptor;
  links: Array<{ rel: string; href: string; type?: string }>;
}

interface ArtifactReference {
  sourceId: string;
  artifactId: string;
  sha256?: string;
  size?: number;
  mediaType?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedUploadRequest(input: unknown, maxBytes: number): ArtifactUploadRequest {
  assertOrThrow(isRecord(input), 400, "ARTIFACT_UPLOAD_INVALID", "Artifact upload request JSON object required.");
  assertOrThrow(typeof input.uploadId === "string" && UUID_PATTERN.test(input.uploadId), 400, "ARTIFACT_UPLOAD_INVALID", "uploadId must be a UUID.");
  assertOrThrow(typeof input.sha256 === "string" && SHA256_PATTERN.test(input.sha256), 400, "ARTIFACT_UPLOAD_INVALID", "sha256 must be a 64-character hexadecimal digest.");
  assertOrThrow(Number.isSafeInteger(input.size) && (input.size as number) >= 0, 400, "ARTIFACT_UPLOAD_INVALID", "size must be a non-negative safe integer.");
  assertOrThrow((input.size as number) <= maxBytes, 413, "PAYLOAD_TOO_LARGE", "Artifact exceeds the configured payload limit.");
  assertOrThrow(typeof input.mediaType === "string" && input.mediaType.trim().length > 0, 400, "ARTIFACT_UPLOAD_INVALID", "mediaType is required.");
  assertOrThrow(input.filename === undefined || typeof input.filename === "string", 400, "ARTIFACT_UPLOAD_INVALID", "filename must be a string.");

  return {
    uploadId: input.uploadId,
    sha256: input.sha256.toLowerCase(),
    size: input.size as number,
    mediaType: input.mediaType.trim(),
    ...(typeof input.filename === "string" ? { filename: input.filename } : {}),
  };
}

function collectArtifactReferences(value: unknown, result: ArtifactReference[] = []): ArtifactReference[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectArtifactReferences(item, result));
    return result;
  }
  if (!isRecord(value)) return result;

  if (typeof value.sourceId === "string" && typeof value.artifactId === "string") {
    result.push({
      sourceId: value.sourceId,
      artifactId: value.artifactId,
      ...(typeof value.sha256 === "string" ? { sha256: value.sha256.toLowerCase() } : {}),
      ...(Number.isSafeInteger(value.size) && (value.size as number) >= 0 ? { size: value.size as number } : {}),
      ...(typeof value.mediaType === "string" ? { mediaType: value.mediaType } : {}),
    });
  }

  Object.values(value).forEach((item) => collectArtifactReferences(item, result));
  return result;
}

// ADR: docs/adr/contracts/0016-artifact-immutability.md — committed source-scoped artifact bytes are immutable and upload sessions are retry-safe.
export class SpatialArtifactService {
  private readonly uploadRoot: string;

  constructor(
    stateDir: string,
    private readonly repository: RepositoryProvider,
    private readonly spatialRoot: string,
    private readonly sourceId: () => Promise<string>,
    private readonly maxBytes: number,
  ) {
    this.uploadRoot = join(stateDir, "artifact-uploads");
  }

  private uploadPath(uploadId: string, relative: string): string {
    assertOrThrow(UUID_PATTERN.test(uploadId), 404, "ARTIFACT_NOT_FOUND", "Artifact upload session not found.");
    return resolveBelow(join(this.uploadRoot, uploadId), relative);
  }

  private artifactBase(artifactId: string): string {
    assertOrThrow(UUID_PATTERN.test(artifactId), 404, "ARTIFACT_NOT_FOUND", "Artifact not found.");
    return `${this.spatialRoot}/artifacts/${artifactId}`;
  }

  private async assertLocalSource(sourceId: string): Promise<void> {
    if (sourceId !== await this.sourceId()) throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  }

  private async loadSession(uploadId: string): Promise<ArtifactUploadSession> {
    try {
      return JSON.parse(await readFile(this.uploadPath(uploadId, "session.json"), "utf8")) as ArtifactUploadSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact upload session not found.");
      }
      throw error;
    }
  }

  private async loadMetadata(artifactId: string): Promise<ArtifactMetadata | null> {
    const data = await this.repository.readFile(`${this.artifactBase(artifactId)}/metadata.json`);
    if (!data) return null;
    return JSON.parse(Buffer.from(data).toString("utf8")) as ArtifactMetadata;
  }

  private descriptor(metadata: ArtifactMetadata, baseUrl: string): ArtifactDescriptor {
    const encodedSource = encodeURIComponent(metadata.sourceId);
    const encodedArtifact = encodeURIComponent(metadata.artifactId);
    const self = `${baseUrl}/spatial/v1/sources/${encodedSource}/artifacts/${encodedArtifact}`;
    return {
      ...metadata,
      links: [
        { rel: "self", href: self },
        { rel: "content", href: `${self}/content`, type: metadata.mediaType },
      ],
    };
  }

  private uploadLinks(sourceId: string, uploadId: string, baseUrl: string): ArtifactUploadStatus["links"] {
    const base = `${baseUrl}/spatial/v1/sources/${encodeURIComponent(sourceId)}/artifact-uploads/${encodeURIComponent(uploadId)}`;
    return [
      { rel: "self", href: base },
      { rel: "content", href: `${base}/content`, type: "application/octet-stream" },
      { rel: "commit", href: `${base}/commit` },
    ];
  }

  async createUpload(sourceId: string, input: unknown, baseUrl: string): Promise<ArtifactUploadStatus> {
    await this.assertLocalSource(sourceId);
    const request = normalizedUploadRequest(input, this.maxBytes);
    const sessionPath = this.uploadPath(request.uploadId, "session.json");

    let session: ArtifactUploadSession;
    try {
      session = JSON.parse(await readFile(sessionPath, "utf8")) as ArtifactUploadSession;
      if (session.sourceId !== sourceId || stableStringify(session.request) !== stableStringify(request)) {
        throw new BridgeError(409, "ARTIFACT_UPLOAD_ID_CONFLICT", "uploadId is already used with different artifact metadata.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const timestamp = nowIso();
      session = {
        sourceId,
        artifactId: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        request,
      };
      await atomicWrite(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
    }

    return this.status(sourceId, request.uploadId, baseUrl);
  }

  async putContent(
    sourceId: string,
    uploadId: string,
    content: Uint8Array,
    declaredSha256: string | undefined,
    baseUrl: string,
  ): Promise<ArtifactUploadStatus> {
    await this.assertLocalSource(sourceId);
    const session = await this.loadSession(uploadId);
    if (session.sourceId !== sourceId) throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact upload session not found.");

    assertOrThrow(content.byteLength <= this.maxBytes, 413, "PAYLOAD_TOO_LARGE", "Artifact exceeds the configured payload limit.");
    assertOrThrow(content.byteLength === session.request.size, 400, "SIZE_MISMATCH", "Uploaded artifact size does not match the declared size.");
    const actual = sha256(content).toLowerCase();
    if (declaredSha256 && declaredSha256.toLowerCase() !== actual) {
      throw new BridgeError(400, "HASH_MISMATCH", "Uploaded artifact does not match the request hash.");
    }
    if (session.request.sha256 !== actual) throw new BridgeError(400, "HASH_MISMATCH", "Uploaded artifact does not match the declared SHA-256.");

    const target = this.uploadPath(uploadId, "content");
    await mkdir(dirname(target), { recursive: true });
    try {
      const existing = await readFile(target);
      if (sha256(existing).toLowerCase() !== actual) {
        throw new BridgeError(409, "ARTIFACT_UPLOAD_ID_CONFLICT", "A different artifact payload is already staged for this uploadId.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(target, content);
    }

    session.updatedAt = nowIso();
    await atomicWrite(this.uploadPath(uploadId, "session.json"), `${JSON.stringify(session, null, 2)}\n`);
    return this.status(sourceId, uploadId, baseUrl);
  }

  async status(sourceId: string, uploadId: string, baseUrl: string): Promise<ArtifactUploadStatus> {
    await this.assertLocalSource(sourceId);
    const session = await this.loadSession(uploadId);
    if (session.sourceId !== sourceId) throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact upload session not found.");

    const committed = await this.loadMetadata(session.artifactId);
    if (committed) {
      return {
        uploadId,
        sourceId,
        state: "committed",
        artifactId: session.artifactId,
        updatedAt: session.updatedAt,
        descriptor: this.descriptor(committed, baseUrl),
        links: this.uploadLinks(sourceId, uploadId, baseUrl),
      };
    }

    let state: ArtifactUploadStatus["state"] = "created";
    try {
      const info = await stat(this.uploadPath(uploadId, "content"));
      if (info.isFile()) {
        const content = await readFile(this.uploadPath(uploadId, "content"));
        state = content.byteLength === session.request.size && sha256(content).toLowerCase() === session.request.sha256
          ? "uploaded"
          : "uploading";
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    return {
      uploadId,
      sourceId,
      state,
      artifactId: session.artifactId,
      updatedAt: session.updatedAt,
      links: this.uploadLinks(sourceId, uploadId, baseUrl),
    };
  }

  async commit(sourceId: string, uploadId: string, baseUrl: string): Promise<ArtifactDescriptor> {
    await this.assertLocalSource(sourceId);
    const session = await this.loadSession(uploadId);
    if (session.sourceId !== sourceId) throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact upload session not found.");

    const existingMetadata = await this.loadMetadata(session.artifactId);
    if (existingMetadata) {
      this.assertMetadataMatches(existingMetadata, session);
      await this.assertCommittedContent(existingMetadata);
      return this.descriptor(existingMetadata, baseUrl);
    }

    let content: Uint8Array;
    try {
      content = await readFile(this.uploadPath(uploadId, "content"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BridgeError(409, "ARTIFACT_NOT_READY", "Artifact content has not been uploaded.");
      }
      throw error;
    }

    if (content.byteLength !== session.request.size) throw new BridgeError(400, "SIZE_MISMATCH", "Artifact content size does not match the declared size.");
    if (sha256(content).toLowerCase() !== session.request.sha256) throw new BridgeError(400, "HASH_MISMATCH", "Artifact content does not match the declared SHA-256.");

    const metadata: ArtifactMetadata = {
      sourceId,
      artifactId: session.artifactId,
      sha256: session.request.sha256,
      size: session.request.size,
      mediaType: session.request.mediaType,
      ...(session.request.filename ? { filename: session.request.filename } : {}),
      createdAt: nowIso(),
    };
    const base = this.artifactBase(session.artifactId);
    const contentPath = `${base}/content`;
    const metadataPath = `${base}/metadata.json`;

    const existingContent = await this.repository.readFile(contentPath);
    if (existingContent) {
      if (existingContent.byteLength !== metadata.size || sha256(existingContent).toLowerCase() !== metadata.sha256) {
        throw new BridgeError(409, "REPOSITORY_CONFLICT", "Artifact content path already contains different immutable bytes.");
      }
    } else {
      try {
        await this.repository.commitFiles([{
          path: contentPath,
          content,
          ifAbsent: true,
        }], `p4u-spatial: artifact content ${session.artifactId}`);
      } catch (error) {
        if (!(error instanceof BridgeError) || error.code !== "REPOSITORY_CONFLICT") throw error;
        const raced = await this.repository.readFile(contentPath);
        if (!raced || raced.byteLength !== metadata.size || sha256(raced).toLowerCase() !== metadata.sha256) throw error;
      }
    }

    const racedMetadata = await this.loadMetadata(session.artifactId);
    if (racedMetadata) {
      this.assertMetadataMatches(racedMetadata, session);
    } else {
      try {
        await this.repository.commitFiles([{
          path: metadataPath,
          content: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`),
          ifAbsent: true,
        }], `p4u-spatial: commit artifact ${session.artifactId}`);
      } catch (error) {
        if (!(error instanceof BridgeError) || error.code !== "REPOSITORY_CONFLICT") throw error;
        const latest = await this.loadMetadata(session.artifactId);
        if (!latest) throw error;
        this.assertMetadataMatches(latest, session);
      }
    }

    session.updatedAt = nowIso();
    await atomicWrite(this.uploadPath(uploadId, "session.json"), `${JSON.stringify(session, null, 2)}\n`);
    await rm(this.uploadPath(uploadId, "content"), { force: true });

    const committed = await this.loadMetadata(session.artifactId);
    if (!committed) throw new BridgeError(500, "ARTIFACT_COMMIT_FAILED", "Artifact metadata was not durably committed.");
    await this.assertCommittedContent(committed);
    return this.descriptor(committed, baseUrl);
  }

  private assertMetadataMatches(metadata: ArtifactMetadata, session: ArtifactUploadSession): void {
    if (
      metadata.sourceId !== session.sourceId
      || metadata.artifactId !== session.artifactId
      || metadata.sha256.toLowerCase() !== session.request.sha256
      || metadata.size !== session.request.size
      || metadata.mediaType !== session.request.mediaType
      || (metadata.filename ?? undefined) !== (session.request.filename ?? undefined)
    ) {
      throw new BridgeError(409, "ARTIFACT_UPLOAD_ID_CONFLICT", "Committed artifact does not match the upload session.");
    }
  }

  private async assertCommittedContent(metadata: ArtifactMetadata): Promise<Uint8Array> {
    const content = await this.repository.readFile(`${this.artifactBase(metadata.artifactId)}/content`);
    if (!content) throw new BridgeError(409, "ARTIFACT_NOT_READY", "Artifact content is not durably available.");
    if (content.byteLength !== metadata.size || sha256(content).toLowerCase() !== metadata.sha256.toLowerCase()) {
      throw new BridgeError(500, "ARTIFACT_CORRUPT", "Committed artifact content failed integrity verification.");
    }
    return content;
  }

  async getDescriptor(sourceId: string, artifactId: string, baseUrl: string): Promise<ArtifactDescriptor> {
    await this.assertLocalSource(sourceId);
    const metadata = await this.loadMetadata(artifactId);
    if (!metadata || metadata.sourceId !== sourceId) throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact not found.");
    await this.assertCommittedContent(metadata);
    return this.descriptor(metadata, baseUrl);
  }

  async getContent(sourceId: string, artifactId: string): Promise<{ metadata: ArtifactMetadata; content: Uint8Array }> {
    await this.assertLocalSource(sourceId);
    const metadata = await this.loadMetadata(artifactId);
    if (!metadata || metadata.sourceId !== sourceId) throw new BridgeError(404, "ARTIFACT_NOT_FOUND", "Artifact not found.");
    return { metadata, content: await this.assertCommittedContent(metadata) };
  }

  async assertReferencesReady(payload: unknown): Promise<void> {
    const localSourceId = await this.sourceId();
    for (const reference of collectArtifactReferences(payload)) {
      if (reference.sourceId !== localSourceId) continue;
      const metadata = await this.loadMetadata(reference.artifactId);
      if (!metadata || metadata.sourceId !== localSourceId) {
        throw new BridgeError(409, "ARTIFACT_NOT_READY", `Artifact is not committed: ${reference.artifactId}`);
      }
      await this.assertCommittedContent(metadata);
      if (reference.sha256 && reference.sha256.toLowerCase() !== metadata.sha256.toLowerCase()) {
        throw new BridgeError(409, "ARTIFACT_NOT_READY", `Artifact hash does not match committed descriptor: ${reference.artifactId}`);
      }
      if (reference.size !== undefined && reference.size !== metadata.size) {
        throw new BridgeError(409, "ARTIFACT_NOT_READY", `Artifact size does not match committed descriptor: ${reference.artifactId}`);
      }
      if (reference.mediaType && reference.mediaType !== metadata.mediaType) {
        throw new BridgeError(409, "ARTIFACT_NOT_READY", `Artifact mediaType does not match committed descriptor: ${reference.artifactId}`);
      }
    }
  }
}
