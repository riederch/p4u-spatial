import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { buildServer } from "../src/server.js";

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
    host: "127.0.0.1", port: 0, publicBaseUrl: "https://bridge.test", adminKey: "bootstrap",
    stateDir: join(root, "state"), repositoryRoot: join(root, "repo"), repositoryProvider: "filesystem",
    repositoryProfile: "generic", gitBranch: "main", gitRefreshIntervalMs: 1000,
    federationRouteId: "upstream", spatialRoot: "spatial", spatialWritable: true,
    spatialRouteId: "git-repository", spatialSourceTitle: "Test", spatialSnapshotTtlSeconds: 600,
    spatialOperationRetentionSeconds: 86400, accessTokenTtlSeconds: 1800, refreshTokenTtlSeconds: 86400,
    pairingTtlSeconds: 300, scanMaxFiles: 256, scanMaxFileBytes: 64 * 1024 * 1024,
    scanMaxTotalBytes: 512 * 1024 * 1024, scanUploadRetentionSeconds: 604800,
    pairingClaimRateLimit: 30, sessionRefreshRateLimit: 60, scanRequestRateLimit: 600,
    federationRetryBaseSeconds: 5, federationRetryMaxSeconds: 300, federationRelayRetentionSeconds: 604800,
  };
}
function cookiePairs(setCookie: string | string[] | undefined): { header: string; csrf: string } {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const pairs = values.map((value) => value.split(";")[0]!);
  const csrfPair = pairs.find((value) => value.startsWith("p4u_admin_csrf="));
  return {
    header: pairs.join("; "),
    csrf: decodeURIComponent(csrfPair?.split("=").slice(1).join("=") ?? ""),
  };
}

describe("administrator GUI authentication", () => {
  it("serves the GUI and supports password+TOTP cookie sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-admin-gui-"));
    const cfg = config(root);
    const app = buildServer(cfg, new FilesystemRepositoryProvider(cfg.repositoryRoot));

    const page = await app.inject({ method: "GET", url: "/admin" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.body).toContain("/admin/credentials");

    const created = await app.inject({
      method: "POST", url: "/api/v1/admin/users",
      headers: { "x-p4u-admin-key": "bootstrap" },
      payload: { username: "christoph", displayName: "Christoph" },
    });
    expect(created.statusCode).toBe(200);
    const userId = (created.json() as { user: { userId: string } }).user.userId;

    const setup = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/password-totp/setup",
      headers: { "x-p4u-admin-key": "bootstrap" },
      payload: { userId, password: "correct horse battery staple" },
    });
    expect(setup.statusCode).toBe(200);
    const setupBody = setup.json() as { setupId: string; secret: string };

    const confirmed = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/password-totp/setup/confirm",
      headers: { "x-p4u-admin-key": "bootstrap" },
      payload: { setupId: setupBody.setupId, code: totp(setupBody.secret) },
    });
    expect(confirmed.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/password-totp/login",
      payload: { username: "christoph", password: "correct horse battery staple", totp: totp(setupBody.secret) },
    });
    expect(login.statusCode).toBe(200);
    const rawCookies = login.headers["set-cookie"];
    const renderedCookies = Array.isArray(rawCookies) ? rawCookies.join("\n") : String(rawCookies);
    expect(renderedCookies).toContain("p4u_admin_session=");
    expect(renderedCookies).toContain("HttpOnly");
    expect(renderedCookies).toContain("Secure");
    expect(renderedCookies).toContain("SameSite=Strict");
    expect(renderedCookies).toContain("p4u_admin_csrf=");

    const cookies = cookiePairs(rawCookies);
    expect(cookies.csrf).not.toBe("");

    const me = await app.inject({
      method: "GET", url: "/api/v1/admin-auth/me",
      headers: { cookie: cookies.header },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { username: "christoph" },
      loginMethods: { passwordTotp: true, passkey: false },
    });

    const logout = await app.inject({
      method: "POST", url: "/api/v1/admin-auth/logout",
      headers: { cookie: cookies.header, "x-p4u-csrf": cookies.csrf },
    });
    expect(logout.statusCode).toBe(200);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");

    await app.close();
  });
});
