import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import type { BridgeConfig } from "../src/config.js";

function sha(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("bridge vertical slice", () => {
  it("discovers Core/Spatial, keeps snapshots consistent and commits an XR scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-spatial-"));
    const config: BridgeConfig = {
      host: "127.0.0.1",
      port: 0,
      publicBaseUrl: "https://bridge.test",
      adminKey: "test-admin-key",
      stateDir: join(root, "state"),
      repositoryRoot: join(root, "repo"),
      repositoryProvider: "filesystem",
      repositoryProfile: "generic",
      gitBranch: "main",
      gitRefreshIntervalMs: 1000,
      federationRouteId: "upstream",
      spatialRoot: "spatial",
      spatialWritable: true,
      spatialRouteId: "git-repository",
      spatialSourceTitle: "Test Spatial Source",
      spatialSnapshotTtlSeconds: 600,
      spatialOperationRetentionSeconds: 86400,
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 86400,
      pairingTtlSeconds: 300
    };

    const repository = new FilesystemRepositoryProvider(config.repositoryRoot);
    await repository.commitFiles([
      {
        path: "spatial/model/assets.jsonl",
        content: Buffer.from('{"objectId":"asset:1","name":"Pump","status":"initial"}\n')
      },
      {
        path: "spatial/model/relations.jsonl",
        content: Buffer.from('{"relationId":"rel:1","predicate":"located-in","subject":{"sourceId":"00000000-0000-7000-8000-000000000001","objectId":"asset:1"},"object":{"sourceId":"00000000-0000-7000-8000-000000000001","objectId":"room:1"},"revision":"1"}\n')
      }
    ], "test fixture");

    const app = buildServer(config, repository);

    const discovery = await app.inject({
      method: "GET",
      url: "/.well-known/open-spatial-interop"
    });
    expect(discovery.statusCode).toBe(200);
    const firstDiscovery = discovery.json() as {
      protocolId: string;
      instanceId: string;
      contracts: Record<string, { href: string }>;
      capabilities: string[];
    };
    expect(firstDiscovery).toMatchObject({
      protocolId: "open-spatial-interop",
      contracts: {
        core: { href: "https://bridge.test/core/v1" },
        spatial: { href: "https://bridge.test/spatial/v1" },
        xr: { href: "https://bridge.test/api/v1" }
      }
    });
    expect(firstDiscovery.capabilities).toContain("spatial.read");

    const unauthenticatedSources = await app.inject({ method: "GET", url: "/spatial/v1/sources" });
    expect(unauthenticatedSources.statusCode).toBe(401);

    const pairing = await app.inject({
      method: "POST",
      url: "/api/v1/admin/pairings",
      headers: { "x-p4u-admin-key": config.adminKey }
    });
    expect(pairing.statusCode).toBe(200);
    const qr = pairing.json() as { pairingId: string; secret: string };

    const deviceId = randomUUID();
    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/pairing/claim",
      payload: {
        pairingId: qr.pairingId,
        secret: qr.secret,
        device: { deviceId, platform: "simulator", model: "test", capabilities: ["head-pose"] }
      }
    });
    expect(claim.statusCode).toBe(200);
    const claimId = (claim.json() as { claimId: string }).claimId;

    expect((await app.inject({
      method: "POST",
      url: `/api/v1/admin/pairing-claims/${claimId}/authorize`,
      headers: { "x-p4u-admin-key": config.adminKey }
    })).statusCode).toBe(200);

    const poll = await app.inject({ method: "GET", url: `/api/v1/pairing/claims/${claimId}` });
    const session = (poll.json() as { session: { accessToken: string } }).session;
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const me = await app.inject({
      method: "GET",
      url: "/core/v1/me",
      headers: auth
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { scopes: string[] }).scopes).toContain("spatial.read");
    expect((me.json() as { scopes: string[] }).scopes).toContain("xr.scan.write");
    expect((me.json() as { scopes: string[] }).scopes).not.toContain("spatial.create");

    const sources = await app.inject({
      method: "GET",
      url: "/spatial/v1/sources",
      headers: auth
    });
    expect(sources.statusCode).toBe(200);
    const source = (sources.json() as { sources: Array<{ sourceId: string; sourceRevision: string }> }).sources[0]!;
    expect(source.sourceId).toBeTruthy();

    const deniedCreate = await app.inject({
      method: "POST",
      url: "/spatial/v1/operations",
      headers: auth,
      payload: {
        operationId: randomUUID(),
        target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:2" },
        action: "create",
        baseRevision: null,
        payload: { objectId: "asset:2", name: "Valve", status: "new" }
      }
    });
    expect(deniedCreate.statusCode).toBe(403);

    const scopeGrant = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/devices/${deviceId}/scopes`,
      headers: { "x-p4u-admin-key": config.adminKey },
      payload: {
        scopes: [
          "spatial.read",
          "spatial.create",
          "spatial.update",
          "spatial.delete",
          "xr.display.read",
          "xr.scan.write",
          "xr.observation.write",
          "xr.task.read",
          "xr.task.answer"
        ]
      }
    });
    expect(scopeGrant.statusCode).toBe(200);

    const collections = await app.inject({
      method: "GET",
      url: `/spatial/v1/sources/${source.sourceId}/collections`,
      headers: auth
    });
    expect(collections.statusCode).toBe(200);
    expect(collections.json()).toMatchObject({
      collections: [
        { id: "assets", itemKind: "feature", itemCount: 1 },
        { id: "relations", itemKind: "relation", itemCount: 1 }
      ]
    });

    const liveInitial = await app.inject({
      method: "GET",
      url: `/spatial/v1/sources/${source.sourceId}/collections/assets/items/asset%3A1`,
      headers: auth
    });
    expect(liveInitial.statusCode).toBe(200);
    expect(liveInitial.json()).toMatchObject({ objectId: "asset:1", status: "initial" });

    const createOperationId = randomUUID();
    const createPayload = {
      operationId: createOperationId,
      target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:2" },
      action: "create",
      baseRevision: null,
      payload: { objectId: "asset:2", name: "Valve", status: "new" }
    };
    const create = await app.inject({ method: "POST", url: "/spatial/v1/operations", headers: auth, payload: createPayload });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({ state: "source-committed", result: { objectId: "asset:2" } });

    const retry = await app.inject({ method: "POST", url: "/spatial/v1/operations", headers: auth, payload: createPayload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(create.json());

    const operationIdConflict = await app.inject({
      method: "POST",
      url: "/spatial/v1/operations",
      headers: auth,
      payload: { ...createPayload, payload: { objectId: "asset:2", name: "Different" } }
    });
    expect(operationIdConflict.statusCode).toBe(409);
    expect(operationIdConflict.json()).toMatchObject({ error: { code: "OPERATION_ID_CONFLICT" } });

    const createdItem = await app.inject({
      method: "GET",
      url: `/spatial/v1/sources/${source.sourceId}/collections/assets/items/asset%3A2`,
      headers: auth
    });
    const createdRevision = createdItem.headers["x-p4u-revision"];
    expect(createdRevision).toBeTruthy();

    const updateOperationId = randomUUID();
    const update = await app.inject({
      method: "POST",
      url: "/spatial/v1/operations",
      headers: auth,
      payload: {
        operationId: updateOperationId,
        target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:2" },
        action: "update",
        baseRevision: createdRevision,
        payload: { objectId: "asset:2", name: "Valve", status: "updated" }
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ state: "source-committed", result: { objectId: "asset:2" } });

    const stale = await app.inject({
      method: "POST",
      url: "/spatial/v1/operations",
      headers: auth,
      payload: {
        operationId: randomUUID(),
        target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:2" },
        action: "delete",
        baseRevision: createdRevision
      }
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.json()).toMatchObject({ state: "conflict", conflict: { type: "revision-mismatch" } });

    const updatedItem = await app.inject({
      method: "GET",
      url: `/spatial/v1/sources/${source.sourceId}/collections/assets/items/asset%3A2`,
      headers: auth
    });
    const updatedRevision = updatedItem.headers["x-p4u-revision"];
    expect(updatedRevision).toBeTruthy();

    const deleted = await app.inject({
      method: "POST",
      url: "/spatial/v1/operations",
      headers: auth,
      payload: {
        operationId: randomUUID(),
        target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:2" },
        action: "delete",
        baseRevision: updatedRevision
      }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ state: "source-committed", result: { objectId: "asset:2" } });

    const snapshotResponse = await app.inject({
      method: "POST",
      url: `/spatial/v1/sources/${source.sourceId}/snapshots`,
      headers: auth
    });
    expect(snapshotResponse.statusCode).toBe(200);
    const snapshot = snapshotResponse.json() as { snapshotId: string; sourceRevision: string };

    await repository.commitFiles([
      {
        path: "spatial/model/assets.jsonl",
        content: Buffer.from('{"objectId":"asset:1","name":"Pump","status":"changed-after-snapshot"}\n')
      }
    ], "change live model");

    const liveChanged = await app.inject({
      method: "GET",
      url: `/spatial/v1/sources/${source.sourceId}/collections/assets/items/asset%3A1`,
      headers: auth
    });
    expect(liveChanged.statusCode).toBe(200);
    expect(liveChanged.json()).toMatchObject({ status: "changed-after-snapshot" });

    const snapshotItem = await app.inject({
      method: "GET",
      url: `/spatial/v1/snapshots/${snapshot.snapshotId}/collections/assets/items/asset%3A1`,
      headers: auth
    });
    expect(snapshotItem.statusCode).toBe(200);
    expect(snapshotItem.json()).toMatchObject({ status: "initial" });

    const sourcesAfterChange = await app.inject({
      method: "GET",
      url: "/spatial/v1/sources",
      headers: auth
    });
    const changedSource = (sourcesAfterChange.json() as { sources: Array<{ sourceId: string; sourceRevision: string }> }).sources[0]!;
    expect(changedSource.sourceId).toBe(source.sourceId);
    expect(changedSource.sourceRevision).not.toBe(snapshot.sourceRevision);

    const scanId = randomUUID();
    const trajectory = "{\"t\":0,\"position\":[0,0,0]}\n";
    const manifest = {
      schemaVersion: "1.0",
      scanId,
      device: { deviceId, platform: "simulator", model: "test" },
      mode: "site",
      createdAt: new Date().toISOString(),
      files: [{ path: "trajectory.jsonl", sha256: sha(trajectory), mediaType: "application/x-ndjson" }]
    };

    expect((await app.inject({
      method: "PUT",
      url: `/api/v1/scans/${scanId}/manifest`,
      headers: auth,
      payload: manifest
    })).statusCode).toBe(200);

    expect((await app.inject({
      method: "PUT",
      url: `/api/v1/scans/${scanId}/files/trajectory.jsonl`,
      headers: { ...auth, "content-type": "application/octet-stream", "x-content-sha256": sha(trajectory) },
      payload: Buffer.from(trajectory)
    })).statusCode).toBe(200);

    const commit = await app.inject({
      method: "POST",
      url: `/api/v1/scans/${scanId}/commit`,
      headers: auth
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json()).toMatchObject({ state: "committed", missingFiles: [] });

    const saved = await readFile(join(config.repositoryRoot, "spatial", "raw", "scans", scanId, "trajectory.jsonl"), "utf8");
    expect(saved).toBe(trajectory);

    await app.close();

    const restarted = buildServer(config, new FilesystemRepositoryProvider(config.repositoryRoot));
    const rediscovery = await restarted.inject({
      method: "GET",
      url: "/.well-known/open-spatial-interop"
    });
    expect(rediscovery.statusCode).toBe(200);
    expect((rediscovery.json() as { instanceId: string }).instanceId).toBe(firstDiscovery.instanceId);
    await restarted.close();
  });
});
