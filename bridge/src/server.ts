import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { BridgeConfig } from "./config.js";
import type { DeviceDescriptor, DeviceScope } from "./domain.js";
import { BridgeError, assertOrThrow } from "./errors.js";
import type { RepositoryProvider } from "./repository/provider.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { PairingService } from "./services/pairing-service.js";
import { ScanUploadService } from "./services/scan-upload-service.js";
import { SessionService } from "./services/session-service.js";
import { normalizeRelativePath, safeEqual, sha256 } from "./util.js";

interface Services {
  devices: DeviceRegistry;
  pairings: PairingService;
  sessions: SessionService;
  scans: ScanUploadService;
}

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) throw new BridgeError(401, "SESSION_EXPIRED", "Bearer token required.");
  return value.slice(7);
}

async function authenticatedDevice(request: FastifyRequest, services: Services, scope?: DeviceScope) {
  const deviceId = await services.sessions.verifyAccess(bearer(request));
  const device = await services.devices.get(deviceId);
  if (!device) throw new BridgeError(401, "SESSION_EXPIRED", "Device authorization no longer exists.");
  if (device.status === "revoked") throw new BridgeError(401, "DEVICE_REVOKED", "Device has been revoked.");
  if (device.status === "disabled") throw new BridgeError(403, "DEVICE_DISABLED", "Device is disabled.");
  if (device.status !== "authorized") throw new BridgeError(403, "DEVICE_NOT_AUTHORIZED", "Device is not authorized.");
  if (scope && !device.scopes.includes(scope)) throw new BridgeError(403, "SCOPE_REQUIRED", `Scope required: ${scope}`);
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

export function buildServer(config: BridgeConfig, repository: RepositoryProvider): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  const services: Services = {
    devices: new DeviceRegistry(config.stateDir),
    pairings: new PairingService(config.stateDir, config.pairingTtlSeconds),
    sessions: new SessionService(config.stateDir, config.accessTokenTtlSeconds, config.refreshTokenTtlSeconds),
    scans: new ScanUploadService(config.stateDir, repository, config.spatialRoot),
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
    await authenticatedDevice(request, services, "display:read");
    const data = await repository.readFile(`${config.spatialRoot}/display/manifest.json`);
    if (!data) throw new BridgeError(404, "DISPLAY_NOT_PUBLISHED", "No display manifest is published.");
    const parsed = JSON.parse(Buffer.from(data).toString("utf8")) as { revision?: string };
    if (parsed.revision) reply.header("ETag", `"${parsed.revision}"`);
    return parsed;
  });

  app.get("/api/v1/display/files/*", async (request, reply) => {
    await authenticatedDevice(request, services, "display:read");
    const path = normalizeRelativePath((request.params as { "*": string })["*"]);
    const data = await repository.readFile(`${config.spatialRoot}/display/${path}`);
    if (!data) throw new BridgeError(404, "DISPLAY_FILE_NOT_FOUND", "Display file not found.");
    return reply.type("application/octet-stream").send(Buffer.from(data));
  });

  app.put("/api/v1/scans/:scanId/manifest", async (request) => {
    const device = await authenticatedDevice(request, services, "scan:write");
    const { scanId } = request.params as { scanId: string };
    return services.scans.putManifest(device.deviceId, scanId, request.body);
  });

  app.put("/api/v1/scans/:scanId/files/*", async (request) => {
    const device = await authenticatedDevice(request, services, "scan:write");
    const params = request.params as { scanId: string; "*": string };
    assertOrThrow(Buffer.isBuffer(request.body), 400, "INVALID_REQUEST", "Binary request body required.");
    const header = request.headers["x-content-sha256"];
    const declared = Array.isArray(header) ? header[0] : header;
    return services.scans.putFile(device.deviceId, params.scanId, params["*"], request.body, declared);
  });

  app.post("/api/v1/scans/:scanId/commit", async (request) => {
    const device = await authenticatedDevice(request, services, "scan:write");
    const { scanId } = request.params as { scanId: string };
    return services.scans.commit(device.deviceId, scanId);
  });

  app.put("/api/v1/observations/:observationId", async (request) => {
    const device = await authenticatedDevice(request, services, "observation:write");
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
