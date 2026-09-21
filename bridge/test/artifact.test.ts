import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { SpatialArtifactService } from "../src/services/spatial-artifact-service.js";

function digest(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("SpatialArtifactService", () => {
  it("keeps upload retries stable and commits immutable verified content", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-artifacts-"));
    const repository = new FilesystemRepositoryProvider(join(root, "repo"));
    const sourceId = randomUUID();
    const service = new SpatialArtifactService(
      join(root, "state"),
      repository,
      "spatial",
      async () => sourceId,
      1024 * 1024,
    );

    const content = Buffer.from("immutable artifact payload");
    const uploadId = randomUUID();
    const request = {
      uploadId,
      sha256: digest(content),
      size: content.byteLength,
      mediaType: "text/plain",
      filename: "evidence.txt",
    };

    const created = await service.createUpload(sourceId, request, "https://bridge.test");
    expect(created).toMatchObject({
      uploadId,
      sourceId,
      state: "created",
    });
    expect(created.artifactId).toBeTruthy();

    const retried = await service.createUpload(sourceId, request, "https://bridge.test");
    expect(retried.artifactId).toBe(created.artifactId);

    await expect(service.createUpload(sourceId, {
      ...request,
      size: content.byteLength + 1,
    }, "https://bridge.test")).rejects.toMatchObject({
      code: "ARTIFACT_UPLOAD_ID_CONFLICT",
      statusCode: 409,
    });

    await expect(service.assertReferencesReady({
      evidence: {
        sourceId,
        artifactId: created.artifactId,
        sha256: request.sha256,
      },
    })).rejects.toMatchObject({
      code: "ARTIFACT_NOT_READY",
      statusCode: 409,
    });

    const uploaded = await service.putContent(
      sourceId,
      uploadId,
      content,
      request.sha256,
      "https://bridge.test",
    );
    expect(uploaded.state).toBe("uploaded");

    const descriptor = await service.commit(sourceId, uploadId, "https://bridge.test");
    expect(descriptor).toMatchObject({
      sourceId,
      artifactId: created.artifactId,
      sha256: request.sha256,
      size: content.byteLength,
      mediaType: "text/plain",
      filename: "evidence.txt",
    });
    expect(descriptor.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ rel: "content", type: "text/plain" }),
    ]));

    const read = await service.getContent(sourceId, descriptor.artifactId);
    expect(Buffer.from(read.content).toString("utf8")).toBe(content.toString("utf8"));

    await expect(service.assertReferencesReady({
      nested: [{
        sourceId,
        artifactId: descriptor.artifactId,
        sha256: descriptor.sha256,
        size: descriptor.size,
        mediaType: descriptor.mediaType,
      }],
    })).resolves.toBeUndefined();

    await expect(service.assertReferencesReady({
      sourceId,
      artifactId: descriptor.artifactId,
      sha256: "f".repeat(64),
    })).rejects.toMatchObject({
      code: "ARTIFACT_NOT_READY",
      statusCode: 409,
    });

    const committedRetry = await service.commit(sourceId, uploadId, "https://bridge.test");
    expect(committedRetry).toEqual(descriptor);

    const storedContent = await repository.readFile(`spatial/artifacts/${descriptor.artifactId}/content`);
    expect(storedContent && digest(storedContent)).toBe(request.sha256);
  });

  it("rejects payload integrity and size mismatches", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-artifacts-invalid-"));
    const repository = new FilesystemRepositoryProvider(join(root, "repo"));
    const sourceId = randomUUID();
    const service = new SpatialArtifactService(
      join(root, "state"),
      repository,
      "spatial",
      async () => sourceId,
      1024,
    );

    const expected = Buffer.from("expected");
    const uploadId = randomUUID();
    await service.createUpload(sourceId, {
      uploadId,
      sha256: digest(expected),
      size: expected.byteLength,
      mediaType: "application/octet-stream",
    }, "https://bridge.test");

    await expect(service.putContent(
      sourceId,
      uploadId,
      Buffer.from("wrong"),
      undefined,
      "https://bridge.test",
    )).rejects.toMatchObject({
      code: "SIZE_MISMATCH",
      statusCode: 400,
    });

    await expect(service.putContent(
      sourceId,
      uploadId,
      Buffer.from("bad-hash"),
      undefined,
      "https://bridge.test",
    )).rejects.toMatchObject({
      code: "HASH_MISMATCH",
      statusCode: 400,
    });
  });
});
