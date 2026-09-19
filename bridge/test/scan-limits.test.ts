import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, utimes, writeFile } from "node:fs/promises";
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
    scanMaxFiles: 2, scanMaxFileBytes: 4, scanMaxTotalBytes: 6,
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

describe("XR scan upload limits", () => {
  it("rejects duplicate paths, oversized declarations and size mismatches", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-scan-limits-"));
    const cfg = config(root);
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));
    const deviceId = randomUUID();
    const auth = await authorize(app, cfg, deviceId);
    const base = { schemaVersion: "1.0", device: { deviceId, platform: "android-pico", model: "PICO" }, mode: "indoor", createdAt: new Date().toISOString() };

    const duplicateId = randomUUID();
    const duplicate = await app.inject({
      method: "PUT", url: `/api/v1/scans/${duplicateId}/manifest`, headers: auth,
      payload: { ...base, scanId: duplicateId, files: [{ path: "a.bin", sha256: sha("a"), size: 1 }, { path: "a.bin", sha256: sha("a"), size: 1 }] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toMatchObject({ error: { code: "DUPLICATE_SCAN_FILE" } });

    const oversizedId = randomUUID();
    const oversized = await app.inject({
      method: "PUT", url: `/api/v1/scans/${oversizedId}/manifest`, headers: auth,
      payload: { ...base, scanId: oversizedId, files: [{ path: "big.bin", sha256: sha("12345"), size: 5 }] },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({ error: { code: "SCAN_FILE_TOO_LARGE" } });

    const scanId = randomUUID();
    expect((await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/manifest`, headers: auth,
      payload: { ...base, scanId, files: [{ path: "a.bin", sha256: sha("abc"), size: 3 }] },
    })).statusCode).toBe(200);

    const mismatch = await app.inject({
      method: "PUT", url: `/api/v1/scans/${scanId}/files/a.bin`,
      headers: { ...auth, "content-type": "application/octet-stream", "x-content-sha256": sha("ab") },
      payload: Buffer.from("ab"),
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: { code: "SIZE_MISMATCH" } });
    await app.close();
  });

  it("removes only stale incomplete server staging", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-scan-cleanup-"));
    const cfg = { ...config(root), scanUploadRetentionSeconds: 60 };,
    pairingClaimRateLimit: 30,
    sessionRefreshRateLimit: 60,
    scanRequestRateLimit: 600
    const repository = new FilesystemRepositoryProvider(cfg.repositoryRoot);
    const app = buildServer(cfg, repository);
    const staleId = randomUUID();
    const freshId = randomUUID();
    const stale = join(cfg.stateDir, "uploads", staleId);
    const fresh = join(cfg.stateDir, "uploads", freshId);
    await mkdir(stale, { recursive: true });
    await mkdir(fresh, { recursive: true });
    await writeFile(join(stale, "manifest.json"), "{}");
    await writeFile(join(fresh, "manifest.json"), "{}");
    const now = Date.now();
    await utimes(join(stale, "manifest.json"), new Date(now - 120_000), new Date(now - 120_000));
    await utimes(join(fresh, "manifest.json"), new Date(now), new Date(now));

    const cleanup = await app.inject({
      method: "POST", url: "/api/v1/admin/xr/scans/cleanup",
      headers: { "x-p4u-admin-key": cfg.adminKey },
    });
    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json()).toEqual({ removed: [staleId], kept: [freshId] });

    await app.close();
  });
});
