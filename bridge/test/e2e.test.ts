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
  it("discovers Core, pairs a device, resolves /me and commits a scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-spatial-"));
    const config: BridgeConfig = {
      host: "127.0.0.1",
      port: 0,
      publicBaseUrl: "https://bridge.test",
      adminKey: "test-admin-key",
      stateDir: join(root, "state"),
      repositoryRoot: join(root, "repo"),
      spatialRoot: "spatial",
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 86400,
      pairingTtlSeconds: 300
    };

    const app = buildServer(config, new FilesystemRepositoryProvider(config.repositoryRoot));

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
        xr: { href: "https://bridge.test/api/v1" }
      }
    });
    expect(firstDiscovery.capabilities).toContain("core.me");

    const unauthenticatedMe = await app.inject({ method: "GET", url: "/core/v1/me" });
    expect(unauthenticatedMe.statusCode).toBe(401);
    expect(unauthenticatedMe.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

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
    expect(session.accessToken).toBeTruthy();

    const auth = { authorization: `Bearer ${session.accessToken}` };

    const me = await app.inject({
      method: "GET",
      url: "/core/v1/me",
      headers: auth
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      principalId: `device:${deviceId}`,
      principalType: "device",
      deviceContext: { deviceId }
    });
    expect((me.json() as { scopes: string[] }).scopes).toContain("xr.scan.write");
    expect((me.json() as { scopes: string[] }).scopes).not.toContain("scan:write");

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
