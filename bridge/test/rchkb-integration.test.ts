import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { BridgeConfig } from "../src/config.js";
import { createRepositoryProvider } from "../src/repository/factory.js";
import { FilesystemRepositoryProvider } from "../src/repository/filesystem.js";
import { buildServer } from "../src/server.js";

const exec = promisify(execFile);

function rchkbConfig(root: string, provider: "filesystem" | "git", gitRemoteUrl?: string): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "https://bridge.test",
    adminKey: "test-admin-key",
    stateDir: join(root, "state"),
    repositoryRoot: join(root, "rchkb-checkout"),
    repositoryProvider: provider,
    repositoryProfile: "rchkb",
    rchkbRoot: "Bärenwirt LW",
    gitBranch: "main",
    ...(gitRemoteUrl ? { gitRemoteUrl } : {}),
    gitRefreshIntervalMs: 1,
    federationRouteId: "upstream",
    spatialRoot: "Bärenwirt LW/_agents/spatial",
    spatialWritable: false,
    spatialRouteId: "rchkb-git",
    spatialSourceTitle: "RCHKB Spatial: Bärenwirt LW",
    spatialSnapshotTtlSeconds: 600,
    spatialOperationRetentionSeconds: 86400,
    accessTokenTtlSeconds: 1800,
    refreshTokenTtlSeconds: 86400,
    pairingTtlSeconds: 300,
    scanMaxFiles: 256, scanMaxFileBytes: 64 * 1024 * 1024, scanMaxTotalBytes: 512 * 1024 * 1024,
    scanUploadRetentionSeconds: 7 * 24 * 60 * 60,
    pairingClaimRateLimit: 30,
    sessionRefreshRateLimit: 60,
    scanRequestRateLimit: 600,
    federationRetryBaseSeconds: 5,
    federationRetryMaxSeconds: 300,
    federationRelayRetentionSeconds: 604800,
  };
}

function pilotAsset(): string {
  return JSON.stringify({
    objectId: "asset:baerenwirt-lw:kwb-usv-80",
    kind: "heating-system",
    name: "KWB USV 80",
    status: "active",
    precision: "relative-only",
    properties: {
      assetId: "kwb-usv-80",
      manufacturer: "KWB - Kraft und Wärme aus Biomasse GmbH",
      model: "KWB USV 80",
      serialNumber: "000-0051040/3",
      year: 2007,
      nominalHeatOutputKw: 80,
    },
    provenance: {
      canonicalPage: "Bärenwirt LW/Gebäude/Heizung/KWB USV 80.md",
    },
  }) + "\n";
}

async function authorize(app: ReturnType<typeof buildServer>, config: BridgeConfig) {
  const pairing = await app.inject({
    method: "POST",
    url: "/api/v1/admin/pairings",
    headers: { "x-p4u-admin-key": config.adminKey },
  });
  const qr = pairing.json() as { pairingId: string; secret: string };
  const deviceId = randomUUID();
  const claim = await app.inject({
    method: "POST",
    url: "/api/v1/pairing/claim",
    payload: {
      pairingId: qr.pairingId,
      secret: qr.secret,
      device: { deviceId, platform: "simulator", model: "rchkb-test", capabilities: [] },
    },
  });
  const claimId = (claim.json() as { claimId: string }).claimId;
  expect((await app.inject({
    method: "POST",
    url: `/api/v1/admin/pairing-claims/${claimId}/authorize`,
    headers: { "x-p4u-admin-key": config.adminKey },
  })).statusCode).toBe(200);
  const poll = await app.inject({ method: "GET", url: `/api/v1/pairing/claims/${claimId}` });
  const token = (poll.json() as { session: { accessToken: string } }).session.accessToken;
  return { deviceId, auth: { authorization: `Bearer ${token}` } };
}

async function assertPilot(app: ReturnType<typeof buildServer>, config: BridgeConfig) {
  const discovery = await app.inject({ method: "GET", url: "/.well-known/open-spatial-interop" });
  expect(discovery.statusCode).toBe(200);
  const advertised = (discovery.json() as { capabilities: string[] }).capabilities;
  expect(advertised).toContain("spatial.read");
  expect(advertised).not.toContain("spatial.create");
  expect(advertised).not.toContain("spatial.update");
  expect(advertised).not.toContain("spatial.delete");

  const { deviceId, auth } = await authorize(app, config);
  const sources = await app.inject({ method: "GET", url: "/spatial/v1/sources", headers: auth });
  expect(sources.statusCode).toBe(200);
  const source = (sources.json() as { sources: Array<{
    sourceId: string;
    route: { routeId: string };
    capabilities: string[];
    writePolicy?: unknown;
  }> }).sources[0]!;
  expect(source.route.routeId).toBe("rchkb-git");
  expect(source.capabilities).toEqual(["spatial.read", "spatial.snapshots"]);
  expect(source.writePolicy).toBeUndefined();

  const collections = await app.inject({
    method: "GET",
    url: `/spatial/v1/sources/${source.sourceId}/collections`,
    headers: auth,
  });
  expect(collections.statusCode).toBe(200);
  expect(collections.json()).toMatchObject({
    collections: [{
      id: "assets",
      itemKind: "feature",
      itemCount: 1,
      permissions: { read: true, create: false, update: false, delete: false },
    }],
  });

  const item = await app.inject({
    method: "GET",
    url: `/spatial/v1/sources/${source.sourceId}/collections/assets/items/asset%3Abaerenwirt-lw%3Akwb-usv-80`,
    headers: auth,
  });
  expect(item.statusCode).toBe(200);
  expect(item.json()).toMatchObject({
    objectId: "asset:baerenwirt-lw:kwb-usv-80",
    precision: "relative-only",
    properties: { assetId: "kwb-usv-80", model: "KWB USV 80" },
    provenance: { canonicalPage: "Bärenwirt LW/Gebäude/Heizung/KWB USV 80.md" },
  });
  expect(item.headers["x-p4u-revision"]).toMatch(/^sha256:/);

  const missingRelations = await app.inject({
    method: "GET",
    url: `/spatial/v1/sources/${source.sourceId}/collections/relations`,
    headers: auth,
  });
  expect(missingRelations.statusCode).toBe(404);

  expect((await app.inject({
    method: "PUT",
    url: `/api/v1/admin/devices/${deviceId}/scopes`,
    headers: { "x-p4u-admin-key": config.adminKey },
    payload: {
      scopes: [
        "spatial.read", "spatial.create", "spatial.update", "spatial.delete",
        "xr.display.read", "xr.scan.write", "xr.observation.write", "xr.task.read", "xr.task.answer",
      ],
    },
  })).statusCode).toBe(200);

  const deniedWrite = await app.inject({
    method: "POST",
    url: "/spatial/v1/operations",
    headers: auth,
    payload: {
      operationId: randomUUID(),
      target: { sourceId: source.sourceId, collectionId: "assets", objectId: "asset:test" },
      action: "create",
      baseRevision: null,
      payload: { objectId: "asset:test", name: "Must not be written" },
    },
  });
  expect(deniedWrite.statusCode).toBe(403);
  expect(deniedWrite.json()).toMatchObject({ error: { code: "SOURCE_READ_ONLY" } });
}

async function createBareRchkb(root: string): Promise<string> {
  const remote = join(root, "rchkb.git");
  const seed = join(root, "seed");
  await exec("git", ["init", "--bare", remote], { cwd: root });
  await exec("git", ["init", "-b", "main", seed], { cwd: root });
  await exec("git", ["config", "user.name", "RCHKB Fixture"], { cwd: seed });
  await exec("git", ["config", "user.email", "fixture@example.invalid"], { cwd: seed });

  const model = join(seed, "Bärenwirt LW", "_agents", "spatial", "model");
  await mkdir(model, { recursive: true });
  await writeFile(join(model, "assets.jsonl"), pilotAsset(), "utf8");
  await exec("git", ["add", "."], { cwd: seed });
  await exec("git", ["commit", "-m", "seed RCHKB spatial pilot"], { cwd: seed });
  await exec("git", ["remote", "add", "origin", remote], { cwd: seed });
  await exec("git", ["push", "-u", "origin", "main"], { cwd: seed });
  await exec("git", ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"], { cwd: root });
  return remote;
}

describe("RCHKB Spatial integration", () => {
  it("exposes a real-style Bärenwirt projection as a read-only Spatial source", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-rchkb-"));
    const config = rchkbConfig(root, "filesystem");
    const repository = new FilesystemRepositoryProvider(config.repositoryRoot);
    await repository.commitFiles([{
      path: "Bärenwirt LW/_agents/spatial/model/assets.jsonl",
      content: Buffer.from(pilotAsset()),
    }], "RCHKB pilot fixture");

    const app = buildServer(config, repository);
    await assertPilot(app, config);
    await app.close();
  });

  it("clones the same RCHKB projection through the generic Git remote provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-rchkb-git-"));
    const remote = await createBareRchkb(root);
    const config = rchkbConfig(root, "git", remote);
    const repository = await createRepositoryProvider(config);

    expect(repository.kind).toBe("git");
    const app = buildServer(config, repository);
    await assertPilot(app, config);
    await app.close();
  });
});
