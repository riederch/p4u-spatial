import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { buildServer } from "../src/server.js";
import { SetupBootstrapService } from "../src/services/setup-bootstrap-service.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decodeBase32(input: string): Buffer {
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of input) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secret: string): string {
  const step = Math.floor(Date.now() / 30_000);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}
function config(root: string): BridgeConfig {
  return {
    host: "127.0.0.1", port: 0,
    stateDir: join(root, "state"), repositoryRoot: join(root, "repo"),
    repositoryProvider: "filesystem", repositoryProfile: "generic", gitBranch: "main",
    gitRefreshIntervalMs: 1000, federationRouteId: "upstream", spatialRoot: "spatial",
    spatialWritable: true, spatialRouteId: "git-repository", spatialSourceTitle: "Test",
    spatialSnapshotTtlSeconds: 600, spatialOperationRetentionSeconds: 86400,
    accessTokenTtlSeconds: 1800, refreshTokenTtlSeconds: 86400, pairingTtlSeconds: 300,
    scanMaxFiles: 256, scanMaxFileBytes: 64 * 1024 * 1024, scanMaxTotalBytes: 512 * 1024 * 1024,
    scanUploadRetentionSeconds: 604800, pairingClaimRateLimit: 30, sessionRefreshRateLimit: 60,
    scanRequestRateLimit: 600, federationRetryBaseSeconds: 5, federationRetryMaxSeconds: 300,
    federationRelayRetentionSeconds: 604800,
  };
}
function cookies(setCookie: string | string[] | undefined) {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const pairs = values.map((value) => value.split(";")[0]!);
  const csrf = pairs.find((value) => value.startsWith("p4u_admin_csrf="))?.split("=").slice(1).join("=") ?? "";
  return { header: pairs.join("; "), csrf: decodeURIComponent(csrf) };
}

describe("first-run administrator bootstrap", () => {
  it("uses a Bridge-generated proof until a permanent login method exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-setup-"));
    const cfg = config(root);
    const bootstrap = new SetupBootstrapService(cfg.stateDir);
    const setup = await bootstrap.ensure();
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));

    const initial = await app.inject({ method: "GET", url: "/api/v1/setup/status" });
    expect(initial.json()).toMatchObject({ setupRequired: true, proofAvailable: true, userCount: 0 });

    const wrong = await app.inject({
      method: "POST", url: "/api/v1/setup/admin",
      payload: { proof: "wrong", username: "christoph" },
    });
    expect(wrong.statusCode).toBe(401);

    const created = await app.inject({
      method: "POST", url: "/api/v1/setup/admin",
      payload: { proof: setup.proof, username: "christoph", displayName: "Christoph" },
    });
    expect(created.statusCode).toBe(200);
    const session = cookies(created.headers["set-cookie"]);
    expect(session.csrf).not.toBe("");

    const passwordSetup = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/password-totp/setup",
      headers: { cookie: session.header, "x-p4u-csrf": session.csrf },
      payload: { password: "correct horse battery staple" },
    });
    expect(passwordSetup.statusCode).toBe(200);
    const passwordBody = passwordSetup.json() as { setupId: string; secret: string };

    // Proof remains usable while setup is incomplete, allowing browser/session recovery.
    const resumed = await app.inject({
      method: "POST", url: "/api/v1/setup/admin",
      payload: { proof: setup.proof },
    });
    expect(resumed.statusCode).toBe(200);

    const confirmed = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/password-totp/setup/confirm",
      headers: { cookie: session.header, "x-p4u-csrf": session.csrf },
      payload: { setupId: passwordBody.setupId, code: totp(passwordBody.secret) },
    });
    expect(confirmed.statusCode).toBe(200);

    const complete = await app.inject({ method: "GET", url: "/api/v1/setup/status" });
    expect(complete.json()).toMatchObject({ setupRequired: false, proofAvailable: false, userCount: 1 });

    const replay = await app.inject({
      method: "POST", url: "/api/v1/setup/admin",
      payload: { proof: setup.proof },
    });
    expect(replay.statusCode).toBe(409);

    await app.close();
  });
});
