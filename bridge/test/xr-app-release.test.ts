import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
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
  };
}

function release(versionCode: number, overrides: Record<string, unknown> = {}) {
  return {
    version: `1.0.${versionCode}`,
    versionCode,
    channel: "stable",
    platform: "android-pico",
    mandatory: false,
    compatibility: { core: "0.1", xr: "0.1", spatial: "0.1" },
    package: {
      href: `https://downloads.example.invalid/p4u-${versionCode}.apk`,
      size: 123456,
      sha256: "a".repeat(64),
      signingCertificateSha256: "b".repeat(64),
    },
    ...overrides,
  };
}

describe("XR application release service", () => {
  it("advertises xr-app and returns the highest published stable version", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-xr-app-"));
    const cfg = config(root);
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));

    const discovery = await app.inject({ method: "GET", url: "/.well-known/open-spatial-interop" });
    expect(discovery.json()).toMatchObject({
      contracts: { "xr-app": { version: "0.1", href: "https://bridge.test/xr-app/v1" } },
      capabilities: expect.arrayContaining(["xr.app.update"]),
    });

    for (const code of [1, 3, 2]) {
      const published = await app.inject({
        method: "PUT",
        url: `/api/v1/admin/xr-app/releases/release-${code}`,
        headers: { "x-p4u-admin-key": "admin" },
        payload: release(code),
      });
      expect(published.statusCode).toBe(200);
    }

    const latest = await app.inject({
      method: "GET",
      url: "/xr-app/v1/releases/latest?channel=stable&platform=android-pico",
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json()).toMatchObject({ releaseId: "release-3", versionCode: 3 });

    const pkg = await app.inject({ method: "GET", url: "/xr-app/v1/releases/release-3/package" });
    expect(pkg.statusCode).toBe(307);
    expect(pkg.headers.location).toBe("https://downloads.example.invalid/p4u-3.apk");

    await app.close();
  });

  it("rejects conflicting release identities and credential-bearing package URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-xr-app-conflict-"));
    const cfg = config(root);
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));
    const headers = { "x-p4u-admin-key": "admin" };

    expect((await app.inject({
      method: "PUT", url: "/api/v1/admin/xr-app/releases/one", headers, payload: release(1),
    })).statusCode).toBe(200);

    const idConflict = await app.inject({
      method: "PUT", url: "/api/v1/admin/xr-app/releases/one", headers,
      payload: release(2),
    });
    expect(idConflict.statusCode).toBe(409);
    expect(idConflict.json()).toMatchObject({ error: { code: "XR_APP_RELEASE_ID_CONFLICT" } });

    const versionConflict = await app.inject({
      method: "PUT", url: "/api/v1/admin/xr-app/releases/two", headers,
      payload: release(1, { version: "1.0.99" }),
    });
    expect(versionConflict.statusCode).toBe(409);
    expect(versionConflict.json()).toMatchObject({ error: { code: "XR_APP_VERSION_CODE_CONFLICT" } });

    const credentials = await app.inject({
      method: "PUT", url: "/api/v1/admin/xr-app/releases/bad-url", headers,
      payload: release(4, {
        package: {
          href: "https://user:secret@example.invalid/p4u.apk",
          size: 123,
          sha256: "a".repeat(64),
          signingCertificateSha256: "b".repeat(64),
        },
      }),
    });
    expect(credentials.statusCode).toBe(400);
    expect(credentials.json()).toMatchObject({ error: { code: "XR_APP_RELEASE_INVALID" } });

    await app.close();
  });
});
