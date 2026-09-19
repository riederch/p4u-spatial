import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import type { CommitResult, FileChange, RepositoryProvider } from "../src/repository/provider.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { buildServer } from "../src/server.js";

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
    pairingClaimRateLimit: 30, sessionRefreshRateLimit: 60, scanRequestRateLimit: 600,
    federationRetryBaseSeconds: 5,
    federationRetryMaxSeconds: 300,
    federationRelayRetentionSeconds: 604800,
  };
}

class UnreadyRepository implements RepositoryProvider {
  readonly kind = "test-unready";
  async readFile(_path: string): Promise<Uint8Array | null> { return null; }
  async exists(_path: string): Promise<boolean> { return false; }
  async probe(): Promise<{ ready: boolean; detail?: string }> { return { ready: false, detail: "fixture unavailable" }; }
  async commitFiles(_changes: FileChange[], _message: string): Promise<CommitResult> { throw new Error("not used"); }
}

describe("bridge health and readiness", () => {
  it("keeps liveness independent from repository readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-ready-"));
    const cfg = config(root);
    const app = buildServer(cfg, new UnreadyRepository());

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", repository: "test-unready" });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      status: "not-ready",
      checks: { state: { ready: true }, repository: { ready: false, detail: "fixture unavailable" } },
    });
    await app.close();
  });

  it("reports a writable filesystem repository ready", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-ready-fs-"));
    const cfg = config(root);
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));
    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      checks: { state: { ready: true }, repository: { ready: true } },
      federation: "disabled",
    });
    await app.close();
  });
});
