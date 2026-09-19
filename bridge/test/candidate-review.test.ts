import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { buildServer } from "../src/server.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function config(root: string): BridgeConfig {
  return {
    host: "127.0.0.1", port: 0, publicBaseUrl: "https://bridge.test", adminKey: "admin",
    stateDir: join(root, "state"), repositoryRoot: join(root, "repo"), repositoryProvider: "filesystem",
    repositoryProfile: "generic", gitBranch: "main", gitRefreshIntervalMs: 1000,
    federationRouteId: "upstream", spatialRoot: "spatial", spatialWritable: true,
    spatialRouteId: "git-repository", spatialSourceTitle: "Test", spatialSnapshotTtlSeconds: 600,
    spatialOperationRetentionSeconds: 86400, accessTokenTtlSeconds: 1800,
    refreshTokenTtlSeconds: 86400, pairingTtlSeconds: 300,
    scanMaxFiles: 256, scanMaxFileBytes: 64 * 1024 * 1024, scanMaxTotalBytes: 512 * 1024 * 1024,
    scanUploadRetentionSeconds: 7 * 24 * 60 * 60,
  };
}

async function authorize(app: ReturnType<typeof buildServer>, cfg: BridgeConfig, deviceId: string) {
  const pairing = await app.inject({ method: "POST", url: "/api/v1/admin/pairings", headers: { "x-p4u-admin-key": cfg.adminKey } });
  const qr = pairing.json() as { pairingId: string; secret: string };
  const claim = await app.inject({
    method: "POST", url: "/api/v1/pairing/claim",
    payload: { pairingId: qr.pairingId, secret: qr.secret, device: { deviceId, platform: "android-pico", model: "PICO" } },
  });
  const claimId = (claim.json() as { claimId: string }).claimId;
  await app.inject({ method: "POST", url: `/api/v1/admin/pairing-claims/${claimId}/authorize`, headers: { "x-p4u-admin-key": cfg.adminKey } });
  const poll = await app.inject({ method: "GET", url: `/api/v1/pairing/claims/${claimId}` });
  return { authorization: `Bearer ${(poll.json() as { session: { accessToken: string } }).session.accessToken}` };
}

describe("XR candidate review pipeline", () => {
  it("requires committed evidence and creates a non-executing operation draft after review", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-candidates-"));
    const cfg = config(root);
    const repository = new FilesystemRepositoryProvider(cfg.repositoryRoot);
    const app = buildServer(cfg, repository);
    const deviceId = randomUUID();
    const auth = await authorize(app, cfg, deviceId);
    const admin = { "x-p4u-admin-key": "admin" };
    const scanId = randomUUID();
    const scene = JSON.stringify({ rooms: [{ id: "room-runtime-1", label: "room" }] });
    const candidateId = "candidate:test-room";
    const candidate = {
      candidateId, scanId, profile: "scene-v1", kind: "room", confidence: 0.91,
      evidence: [{ scanId, path: "scene.json", evidenceId: "room-runtime-1" }],
      proposal: { name: "Detected room", precision: "local-metric" },
    };

    const beforeCommit = await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/candidates/${encodeURIComponent(candidateId)}`,
      headers: auth, payload: candidate,
    });
    expect(beforeCommit.statusCode).toBe(409);
    expect(beforeCommit.json()).toMatchObject({ error: { code: "SCAN_NOT_COMMITTED" } });

    const manifest = {
      schemaVersion: "1.0", scanId,
      device: { deviceId, platform: "android-pico", model: "PICO" },
      mode: "indoor", createdAt: new Date().toISOString(),
      files: [{ path: "scene.json", sha256: sha(scene) }],
    };
    await app.inject({ method: "PUT", url: `/api/v1/scans/${scanId}/manifest`, headers: auth, payload: manifest });
    await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/files/scene.json`,
      headers: { ...auth, "content-type": "application/octet-stream", "x-content-sha256": sha(scene) },
      payload: Buffer.from(scene),
    });
    expect((await app.inject({ method: "POST", url: `/api/v1/scans/${scanId}/commit`, headers: auth })).statusCode).toBe(200);

    const submitted = await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/candidates/${encodeURIComponent(candidateId)}`,
      headers: auth, payload: candidate,
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({ candidate: { candidateId, review: { state: "pending" } } });

    const pending = await app.inject({ method: "GET", url: "/api/v1/admin/xr/candidates?state=pending", headers: admin });
    expect(pending.json()).toMatchObject({ candidates: [{ candidateId }] });

    const review = await app.inject({
      method: "PUT", url: `/api/v1/admin/xr/candidates/${encodeURIComponent(candidateId)}/review`, headers: admin,
      payload: {
        decision: "accepted", reviewer: "admin:test", sourceId: "source:test", collectionId: "rooms",
        note: "Room boundary checked against capture.",
      },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({ candidate: { review: { state: "accepted" } } });

    const draft = await app.inject({
      method: "GET", url: `/api/v1/admin/xr/candidates/${encodeURIComponent(candidateId)}/operation-draft`, headers: admin,
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({
      draft: true, candidateId, scanId, action: "create", baseRevision: null,
      target: { sourceId: "source:test", collectionId: "rooms" },
      payload: { name: "Detected room", precision: "local-metric" },
      provenance: { scanId, candidateId, derivationProfile: "scene-v1" },
    });

    expect(await repository.readFile("spatial/model/rooms.jsonl")).toBeNull();

    const localSource = (await app.inject({
      method: "GET", url: "/spatial/v1/sources", headers: auth,
    })).json() as { sources: Array<{ sourceId: string }> };

    const secondId = "candidate:promotable-room";
    const second = { ...candidate, candidateId: secondId };
    expect((await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/candidates/${encodeURIComponent(secondId)}`,
      headers: auth, payload: second,
    })).statusCode).toBe(200);

    expect((await app.inject({
      method: "PUT", url: `/api/v1/admin/xr/candidates/${encodeURIComponent(secondId)}/review`, headers: admin,
      payload: {
        decision: "accepted", reviewer: "admin:test",
        sourceId: localSource.sources[0]!.sourceId, collectionId: "rooms",
      },
    })).statusCode).toBe(200);

    const preview = await app.inject({
      method: "GET",
      url: `/api/v1/admin/xr/candidates/${encodeURIComponent(secondId)}/promotion-preview`,
      headers: admin,
    });
    expect(preview.statusCode).toBe(200);
    const promotion = preview.json() as {
      confirmationToken: string;
      operation: { operationId: string; payload: Record<string, unknown> };
    };
    expect(promotion.operation.payload).toMatchObject({
      name: "Detected room",
      provenance: {
        xrCapture: {
          scanId,
          candidateId: secondId,
          derivationProfile: "scene-v1",
          reviewer: "admin:test",
        },
      },
    });
    expect(await repository.readFile("spatial/model/rooms.jsonl")).toBeNull();

    const wrongConfirmation = await app.inject({
      method: "POST",
      url: `/api/v1/admin/xr/candidates/${encodeURIComponent(secondId)}/promote`,
      headers: admin,
      payload: { confirmationToken: "wrong" },
    });
    expect(wrongConfirmation.statusCode).toBe(409);
    expect(await repository.readFile("spatial/model/rooms.jsonl")).toBeNull();

    const promoted = await app.inject({
      method: "POST",
      url: `/api/v1/admin/xr/candidates/${encodeURIComponent(secondId)}/promote`,
      headers: admin,
      payload: { confirmationToken: promotion.confirmationToken },
    });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json()).toMatchObject({
      candidateId: secondId,
      operation: { operationId: promotion.operation.operationId, state: "source-committed" },
    });

    const roomData = await repository.readFile("spatial/model/rooms.jsonl");
    expect(roomData).not.toBeNull();
    expect(Buffer.from(roomData!).toString("utf8")).toContain(secondId);

    const promotedRetry = await app.inject({
      method: "POST",
      url: `/api/v1/admin/xr/candidates/${encodeURIComponent(secondId)}/promote`,
      headers: admin,
      payload: { confirmationToken: promotion.confirmationToken },
    });
    expect(promotedRetry.statusCode).toBe(200);
    expect(promotedRetry.json()).toEqual(promoted.json());

    await app.close();
  });
});
