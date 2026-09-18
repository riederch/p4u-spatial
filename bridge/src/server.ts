import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { BridgeConfig } from "./config.js";
import {
  canonicalDeviceScopes,
  hasDeviceScope,
  type DeviceDescriptor,
  type DeviceScope,
} from "./domain.js";
import { BridgeError, assertOrThrow } from "./errors.js";
import type { RepositoryProvider } from "./repository/provider.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { InstanceIdentityService } from "./services/instance-identity.js";
import { PairingService } from "./services/pairing-service.js";
import { ScanUploadService } from "./services/scan-upload-service.js";
import { SessionService } from "./services/session-service.js";
import { SpatialReadService } from "./services/spatial-read-service.js";
import { normalizeRelativePath, safeEqual, sha256 } from "./util.js";

interface Services {
  devices: DeviceRegistry;
  identity: InstanceIdentityService;
  pairings: PairingService;
  sessions: SessionService;
  scans: ScanUploadService;
  spatial: SpatialReadService;
}

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) throw new BridgeError(401, "AUTH_REQUIRED", "Bearer token required.");
  return value.slice(7);
}

async function authenticatedDevice(request: FastifyRequest, services: Services, scope?: DeviceScope) {
  const deviceId = await services.sessions.verifyAccess(bearer(request));
  const device = await services.devices.get(deviceId);
  if (!device) throw new BridgeError(401, "SESSION_EXPIRED", "Device authorization no longer exists.");
  if (device.status === "revoked") throw new BridgeError(401, "DEVICE_REVOKED", "Device has been revoked.");
  if (device.status === "disabled") throw new BridgeError(403, "DEVICE_DISABLED", "Device is disabled.");
  if (device.status !== "authorized") throw new BridgeError(403, "DEVICE_NOT_AUTHORIZED", "Device is not authorized.");
  if (scope && !hasDeviceScope(device.scopes, scope)) throw new BridgeError(403, "SCOPE_REQUIRED", `Scope required: ${scope}`);
  await services.devices.touch(device.deviceId);
  return device;
}

function requireAdmin(request: FastifyRequest, config: BridgeConfig): void {
  if (!config.adminKey) throw new BridgeError(503, "ADMIN_API_DISABLED", "P4U_ADMIN_KEY is not configured.");
  const supplied = request.headers["x-p4u-admin-key"];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  if (!value || !safeEqual(config.adminKey, value)) throw new BridgeError(401, "ADMIN_UNAUTHORIZED", "Invalid admin key.");
}

function publicBridgeUrl(request: FastifyRequest, config: BridgeConfig): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/$/, "");
  const host = request.headers.host;
  assertOrThrow(host, 500, "PUBLIC_URL_UNAVAILABLE", "Set P4U_PUBLIC_BASE_URL when Host is unavailable.");
  return `${request.protocol}://${host}`;
}

function principalId(deviceId: string): string {
  return `device:${deviceId}`;
}

export function buildServer(config: BridgeConfig, repository: RepositoryProvider): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  const services: Services = {
    devices: new DeviceRegistry(config.stateDir),
    identity: new InstanceIdentityService(config.stateDir),
    pairings: new PairingService(config.stateDir, config.pairingTtlSeconds),
    sessions: new SessionService(config.stateDir, config.accessTokenTtlSeconds, config.refreshTokenTtlSeconds),
    scans: new ScanUploadService(config.stateDir, repository, config.spatialRoot),
    spatial: new SpatialReadService(
      config.stateDir,
      repository,
      config.spatialRoot,
      config.spatialSourceTitle,
      config.spatialSnapshotTtlSeconds,
    ),
  };

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof BridgeError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId, ...(error.details ? { details: error.details } : {}) },
      });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error.", requestId } });
  });

  app.get("/health", async () => ({ status: "ok", repository: repository.kind }));

  app.get("/.well-known/open-spatial-interop", async (request) => {
    const base = publicBridgeUrl(request, config);
    return {
      protocolId: "open-spatial-interop",
      coreVersion: "0.1",
      instanceId: await services.identity.get(),
      serverTime: new Date().toISOString(),
      roles: ["content-provider"],
      contracts: {
        core: { version: "0.1", href: `${base}/core/v1` },
        spatial: { version: "0.1", href: `${base}/spatial/v1` },
        xr: { version: "0.1", href: `${base}/api/v1` },
      },
      authentication: {
        required: true,
        bearer: true,
        methods: ["xr-pairing"],
      },
      capabilities: [
        "core.me",
        "spatial.read",
        "spatial.snapshots",
        "xr.pairing",
        "xr.device",
        "xr.display.read",
        "xr.scan.write",
        "xr.observation.write",
      ],
    };
  });

  app.get("/core/v1/me", async (request) => {
    const device = await authenticatedDevice(request, services);
    return {
      principalId: principalId(device.deviceId),
      principalType: "device",
      displayName: device.name ?? `${device.platform} ${device.model}`,
      scopes: canonicalDeviceScopes(device.scopes),
      deviceContext: {
        deviceId: device.deviceId,
      },
    };
  });

  app.get("/spatial/v1", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const base = publicBridgeUrl(request, config);
    return {
      version: "0.1",
      links: [
        { rel: "sources", href: `${base}/spatial/v1/sources` },
      ],
    };
  });

  app.get("/spatial/v1/sources", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const base = publicBridgeUrl(request, config);
    return {
      sources: [await services.spatial.sourceDescriptor(base)],
    };
  });

  app.get("/spatial/v1/sources/:sourceId", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    await services.spatial.assertSource(sourceId);
    return services.spatial.sourceDescriptor(publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/sources/:sourceId/collections", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    await services.spatial.assertSource(sourceId);
    return services.spatial.listCollections(publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    await services.spatial.assertSource(sourceId);
    return services.spatial.getCollection(collectionId, publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    await services.spatial.assertSource(sourceId);
    return services.spatial.listItems(collectionId);
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items/:objectId", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId, objectId } = request.params as {
      sourceId: string;
      collectionId: string;
      objectId: string;
    };
    await services.spatial.assertSource(sourceId);
    return services.spatial.getItem(collectionId, objectId);
  });

  app.post("/spatial/v1/sources/:sourceId/snapshots", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    await services.spatial.assertSource(sourceId);
    return services.spatial.createSnapshot(principalId(device.deviceId), publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/snapshots/:snapshotId", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { snapshotId } = request.params as { snapshotId: string };
    return services.spatial.getSnapshot(snapshotId, principalId(device.deviceId), publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/snapshots/:snapshotId/collections", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { snapshotId } = request.params as { snapshotId: string };
    return services.spatial.listSnapshotCollections(snapshotId, principalId(device.deviceId), publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/snapshots/:snapshotId/collections/:collectionId/items", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { snapshotId, collectionId } = request.params as { snapshotId: string; collectionId: string };
    return services.spatial.listSnapshotItems(snapshotId, principalId(device.deviceId), collectionId);
  });

  app.get("/spatial/v1/snapshots/:snapshotId/collections/:collectionId/items/:objectId", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { snapshotId, collectionId, objectId } = request.params as {
      snapshotId: string;
      collectionId: string;
      objectId: string;
    };
    return services.spatial.getSnapshotItem(snapshotId, principalId(device.deviceId), collectionId, objectId);
  });

  app.post("/api/v1/admin/pairings", async (request) => {
    requireAdmin(request, config);
    return services.pairings.create(publicBridgeUrl(request, config));
  });

  app.get("/api/v1/admin/devices", async (request) => {
    requireAdmin(request, config);
    return { devices: await services.devices.list() };
  });

  app.post("/api/v1/admin/pairing-claims/:claimId/authorize", async (request) => {
    requireAdmin(request, config);
    const { claimId } = request.params as { claimId: string };
    const descriptor = await services.pairings.pendingDescriptor(claimId);
    const device = await services.devices.authorize(descriptor);
    const bootstrap = await services.sessions.issue(device.deviceId);
    await services.pairings.authorize(claimId, bootstrap);
    return { device };
  });

  app.post("/api/v1/admin/pairing-claims/:claimId/reject", async (request) => {
    requireAdmin(request, config);
    const { claimId } = request.params as { claimId: string };
    await services.pairings.reject(claimId);
    return { status: "rejected" };
  });

  app.post("/api/v1/admin/devices/:deviceId/enable", async (request) => {
    requireAdmin(request, config);
    const { deviceId } = request.params as { deviceId: string };
    return { device: await services.devices.setStatus(deviceId, "authorized") };
  });

  app.post("/api/v1/admin/devices/:deviceId/disable", async (request) => {
    requireAdmin(request, config);
    const { deviceId } = request.params as { deviceId: string };
    return { device: await services.devices.setStatus(deviceId, "disabled") };
  });

  app.post("/api/v1/admin/devices/:deviceId/revoke", async (request) => {
    requireAdmin(request, config);
    const { deviceId } = request.params as { deviceId: string };
    const device = await services.devices.setStatus(deviceId, "revoked");
    await services.sessions.revokeDevice(deviceId);
    return { device };
  });

  app.post("/api/v1/pairing/claim", async (request) => {
    const body = request.body as { pairingId?: string; secret?: string; device?: DeviceDescriptor };
    assertOrThrow(body && typeof body === "object", 400, "INVALID_REQUEST", "JSON object required.");
    assertOrThrow(typeof body.pairingId === "string", 400, "INVALID_REQUEST", "pairingId is required.");
    assertOrThrow(typeof body.secret === "string", 400, "INVALID_REQUEST", "secret is required.");
    assertOrThrow(body.device && typeof body.device === "object", 400, "INVALID_REQUEST", "device is required.");
    assertOrThrow(typeof body.device.deviceId === "string", 400, "INVALID_REQUEST", "device.deviceId is required.");
    assertOrThrow(typeof body.device.platform === "string", 400, "INVALID_REQUEST", "device.platform is required.");
    assertOrThrow(typeof body.device.model === "string", 400, "INVALID_REQUEST", "device.model is required.");
    body.device.capabilities ??= [];

    const claimId = await services.pairings.claim(body.pairingId, body.secret, body.device);
    return { claimId, status: "pending" };
  });

  app.get("/api/v1/pairing/claims/:claimId", async (request) => {
    const { claimId } = request.params as { claimId: string };
    const claim = await services.pairings.getClaim(claimId);
    if (claim.state === "authorized") return { status: "authorized", session: claim.bootstrap };
    return { status: claim.state === "claimed" ? "pending" : claim.state };
  });

  app.post("/api/v1/session/refresh", async (request) => {
    const body = request.body as { refreshToken?: string };
    assertOrThrow(typeof body?.refreshToken === "string", 400, "INVALID_REQUEST", "refreshToken is required.");
    const refreshed = await services.sessions.refresh(body.refreshToken);
    const device = await services.devices.get(refreshed.deviceId);
    if (!device || device.status === "revoked") throw new BridgeError(401, "DEVICE_REVOKED", "Device has been revoked.");
    if (device.status === "disabled") throw new BridgeError(403, "DEVICE_DISABLED", "Device is disabled.");
    return refreshed.session;
  });

  app.post("/api/v1/session/logout", async (request) => {
    const token = bearer(request);
    await services.sessions.logout(token);
    return { status: "logged-out" };
  });

  app.get("/api/v1/device", async (request) => ({ device: await authenticatedDevice(request, services) }));

  app.get("/api/v1/display/manifest", async (request, reply) => {
    await authenticatedDevice(request, services, "xr.display.read");
    const data = await repository.readFile(`${config.spatialRoot}/display/manifest.json`);
    if (!data) throw new BridgeError(404, "DISPLAY_NOT_PUBLISHED", "No display manifest is published.");
    const parsed = JSON.parse(Buffer.from(data).toString("utf8")) as { revision?: string };
    if (parsed.revision) reply.header("ETag", `"${parsed.revision}"`);
    return parsed;
  });

  app.get("/api/v1/display/files/*", async (request, reply) => {
    await authenticatedDevice(request, services, "xr.display.read");
    const path = normalizeRelativePath((request.params as { "*": string })["*"]);
    const data = await repository.readFile(`${config.spatialRoot}/display/${path}`);
    if (!data) throw new BridgeError(404, "DISPLAY_FILE_NOT_FOUND", "Display file not found.");
    return reply.type("application/octet-stream").send(Buffer.from(data));
  });

  app.put("/api/v1/scans/:scanId/manifest", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    const { scanId } = request.params as { scanId: string };
    return services.scans.putManifest(device.deviceId, scanId, request.body);
  });

  app.put("/api/v1/scans/:scanId/files/*", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    const params = request.params as { scanId: string; "*": string };
    assertOrThrow(Buffer.isBuffer(request.body), 400, "INVALID_REQUEST", "Binary request body required.");
    const header = request.headers["x-content-sha256"];
    const declared = Array.isArray(header) ? header[0] : header;
    return services.scans.putFile(device.deviceId, params.scanId, params["*"], request.body, declared);
  });

  app.post("/api/v1/scans/:scanId/commit", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    const { scanId } = request.params as { scanId: string };
    return services.scans.commit(device.deviceId, scanId);
  });

  app.put("/api/v1/observations/:observationId", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.observation.write");
    const { observationId } = request.params as { observationId: string };
    const body = request.body as Record<string, unknown>;
    assertOrThrow(body && typeof body === "object", 400, "INVALID_REQUEST", "Observation JSON object required.");

    const content = Buffer.from(`${JSON.stringify({ ...body, id: observationId, deviceId: device.deviceId }, null, 2)}\n`);
    const path = `${config.spatialRoot}/raw/observations/${normalizeRelativePath(observationId)}.json`;
    const existing = await repository.readFile(path);
    if (existing) {
      if (sha256(existing) !== sha256(content)) throw new BridgeError(409, "OBSERVATION_ID_CONFLICT", "Observation ID already exists with different content.");
      return { observationId, status: "exists" };
    }
    const result = await repository.commitFiles([{ path, content, ifAbsent: true }], `p4u-spatial: observation ${observationId}`);
    return { observationId, status: "created", revision: result.revision };
  });

  return app;
}
