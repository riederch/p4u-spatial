import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import { BridgeConfigStore } from "../src/services/bridge-config-store.js";

function bootstrap(root: string): BridgeConfig {
  return {
    host: "127.0.0.1", port: 8787, adminKey: "bootstrap",
    stateDir: join(root, "state"), repositoryRoot: join(root, "repo"),
    repositoryProvider: "filesystem", repositoryProfile: "generic",
    gitBranch: "main", gitRefreshIntervalMs: 1000, federationRouteId: "upstream",
    spatialRoot: "spatial", spatialWritable: true, spatialRouteId: "git-repository",
    spatialSourceTitle: "P4U Spatial", spatialSnapshotTtlSeconds: 600,
    spatialOperationRetentionSeconds: 86400, accessTokenTtlSeconds: 1800,
    refreshTokenTtlSeconds: 86400, pairingTtlSeconds: 300,
    scanMaxFiles: 256, scanMaxFileBytes: 64 * 1024 * 1024,
    scanMaxTotalBytes: 512 * 1024 * 1024, scanUploadRetentionSeconds: 604800,
    pairingClaimRateLimit: 30, sessionRefreshRateLimit: 60, scanRequestRateLimit: 600,
    federationRetryBaseSeconds: 5, federationRetryMaxSeconds: 300,
    federationRelayRetentionSeconds: 604800,
  };
}

describe("persistent bridge configuration", () => {
  it("migrates bootstrap values once and then treats state as authoritative", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-config-"));
    const first = bootstrap(root);
    first.spatialSourceTitle = "Legacy ENV title";
    const store = new BridgeConfigStore(first.stateDir, first);

    expect((await store.loadOrMigrate()).spatialSourceTitle).toBe("Legacy ENV title");
    await store.update({
      spatialSourceTitle: "Persistent title",
      publicBaseUrl: "https://p4u.example.at",
      gitToken: "secret-token",
    });

    const changedBootstrap = bootstrap(root);
    changedBootstrap.spatialSourceTitle = "Changed ENV title";
    const restarted = new BridgeConfigStore(changedBootstrap.stateDir, changedBootstrap);
    const resolved = await restarted.loadOrMigrate();
    expect(resolved.spatialSourceTitle).toBe("Persistent title");
    expect(resolved.publicBaseUrl).toBe("https://p4u.example.at");
    expect(resolved.gitToken).toBe("secret-token");
    expect(resolved.host).toBe(changedBootstrap.host);
    expect(resolved.adminKey).toBe("bootstrap");

    const publicView = await restarted.publicView();
    expect(publicView.gitToken).toEqual({ configured: true });
  });

  it("derives the RCHKB spatial root and validates git configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-config-"));
    const initial = bootstrap(root);
    const store = new BridgeConfigStore(initial.stateDir, initial);
    await store.loadOrMigrate();

    await store.update({
      repositoryProvider: "git",
      gitRemoteUrl: "https://gitea.example.invalid/owner/rchkb.git",
      repositoryProfile: "rchkb",
      rchkbRoot: "Feuerwehr/Pogoeriach",
      spatialWritable: false,
    });

    const resolved = await store.loadOrMigrate();
    expect(resolved.repositoryProvider).toBe("git");
    expect(resolved.repositoryProfile).toBe("rchkb");
    expect(resolved.spatialRoot).toBe("Feuerwehr/Pogoeriach/_agents/spatial");
    expect(resolved.spatialRouteId).toBe("rchkb-git");
  });
});
