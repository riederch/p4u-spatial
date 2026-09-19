import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { BridgeConfig } from "./config.js";
import {
  CANONICAL_DEVICE_SCOPES,
  canonicalDeviceScopes,
  hasDeviceScope,
  isDeviceScope,
  type DeviceDescriptor,
  type DeviceScope,
} from "./domain.js";
import { BridgeError, assertOrThrow } from "./errors.js";
import type { RepositoryProvider } from "./repository/provider.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { FederationService, type FederatedReadResult } from "./services/federation-service.js";
import { InstanceIdentityService } from "./services/instance-identity.js";
import { PairingService } from "./services/pairing-service.js";
import { ScanUploadService } from "./services/scan-upload-service.js";
import { SessionService } from "./services/session-service.js";
import { SpatialReadService } from "./services/spatial-read-service.js";
import { SpatialWriteService, type SpatialWriteAction } from "./services/spatial-write-service.js";
import { XrAppReleaseService } from "./services/xr-app-release-service.js";
import { CandidateReviewService } from "./services/candidate-review-service.js";
import { normalizeRelativePath, safeEqual, sha256, stableStringify } from "./util.js";

interface Services {
  devices: DeviceRegistry;
  identity: InstanceIdentityService;
  pairings: PairingService;
  sessions: SessionService;
  scans: ScanUploadService;
  spatial: SpatialReadService;
  spatialWrite: SpatialWriteService;
  xrAppReleases: XrAppReleaseService;
  candidates: CandidateReviewService;
  federation?: FederationService;
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

function operationAction(body: unknown): SpatialWriteAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BridgeError(400, "OPERATION_INVALID", "Operation JSON object required.");
  const action = (body as Record<string, unknown>).action;
  if (action !== "create" && action !== "update" && action !== "delete") throw new BridgeError(400, "OPERATION_INVALID", "action must be create, update or delete.");
  return action;
}

function spatialActionScope(action: SpatialWriteAction): DeviceScope {
  return `spatial.${action}` as DeviceScope;
}

function applyFederatedReadHeaders(reply: FastifyReply, result: FederatedReadResult): void {
  reply.header("X-P4U-Delivery", result.deliveryMode);
  reply.header("X-P4U-Freshness", result.freshness);
  if (result.revision) {
    reply.header("ETag", `"${result.revision}"`);
    reply.header("X-P4U-Revision", result.revision);
  }
}

export function buildServer(config: BridgeConfig, repository: RepositoryProvider): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  const spatial = new SpatialReadService(
    config.stateDir,
    repository,
    config.spatialRoot,
    config.spatialSourceTitle,
    config.spatialRouteId,
    config.spatialWritable,
    config.spatialSnapshotTtlSeconds,
    config.spatialOperationRetentionSeconds,
  );

  const federation = config.federationUpstreamUrl
    ? new FederationService(config.stateDir, {
        upstreamUrl: config.federationUpstreamUrl,
        routeId: config.federationRouteId,
        accessMode: config.federationToken ? "service" : "anonymous",
        ...(config.federationToken ? { token: config.federationToken } : {}),
      })
    : undefined;

  const scans = new ScanUploadService(config.stateDir, repository, config.spatialRoot);
  const services: Services = {
    devices: new DeviceRegistry(config.stateDir),
    identity: new InstanceIdentityService(config.stateDir),
    pairings: new PairingService(config.stateDir, config.pairingTtlSeconds),
    sessions: new SessionService(config.stateDir, config.accessTokenTtlSeconds, config.refreshTokenTtlSeconds),
    scans,
    spatial,
    spatialWrite: new SpatialWriteService(
      config.stateDir,
      repository,
      config.spatialRoot,
      () => spatial.sourceId(),
    ),
    xrAppReleases: new XrAppReleaseService(config.stateDir),
    candidates: new CandidateReviewService(config.stateDir, (scanId) => scans.isCommitted(scanId)),
    ...(federation ? { federation } : {}),
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

  app.get("/health", async () => ({
    status: "ok",
    repository: repository.kind,
    federation: services.federation ? "configured" : "disabled",
  }));

  app.get("/.well-known/open-spatial-interop", async (request) => {
    const base = publicBridgeUrl(request, config);
    return {
      protocolId: "open-spatial-interop",
      coreVersion: "0.1",
      instanceId: await services.identity.get(),
      serverTime: new Date().toISOString(),
      roles: services.federation ? ["content-provider", "federation-provider"] : ["content-provider"],
      contracts: {
        core: { version: "0.1", href: `${base}/core/v1` },
        spatial: { version: "0.1", href: `${base}/spatial/v1` },
        ...(services.federation ? { federation: { version: "0.1", href: `${base}/spatial/v1` } } : {}),
        xr: { version: "0.1", href: `${base}/api/v1` },
        "xr-app": { version: "0.1", href: `${base}/xr-app/v1` },
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
        ...(config.spatialWritable ? ["spatial.create", "spatial.update", "spatial.delete"] : []),
        ...(services.federation ? ["federation.read", "federation.cache", "federation.durable-relay"] : []),
        "xr.pairing",
        "xr.device",
        "xr.display.read",
        "xr.scan.write",
        "xr.observation.write",
        "xr.app.update",
      ],
    };
  });

  app.get("/xr-app/v1/releases/latest", async (request) => {
    const query = request.query as { channel?: string; platform?: string };
    return services.xrAppReleases.latest(query.channel, query.platform);
  });

  app.get("/xr-app/v1/releases/:releaseId", async (request) => {
    const { releaseId } = request.params as { releaseId: string };
    return services.xrAppReleases.get(releaseId);
  });

  app.get("/xr-app/v1/releases/:releaseId/package", async (request, reply) => {
    const { releaseId } = request.params as { releaseId: string };
    const release = await services.xrAppReleases.get(releaseId);
    return reply.redirect(release.package.href, 307);
  });

  app.put("/api/v1/admin/xr-app/releases/:releaseId", async (request) => {
    requireAdmin(request, config);
    const { releaseId } = request.params as { releaseId: string };
    const body = request.body as Record<string, unknown>;
    assertOrThrow(body && typeof body === "object" && !Array.isArray(body), 400, "XR_APP_RELEASE_INVALID", "Release descriptor JSON object required.");
    if ("releaseId" in body) {
      assertOrThrow(body.releaseId === releaseId, 400, "XR_APP_RELEASE_INVALID", "Body releaseId must match URL releaseId.");
    } else {
      body.releaseId = releaseId;
    }
    return { release: await services.xrAppReleases.publish(body) };
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
        { rel: "operations", href: `${base}/spatial/v1/operations` },
      ],
    };
  });

  app.get("/spatial/v1/sources", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const base = publicBridgeUrl(request, config);
    const sources = [await services.spatial.sourceDescriptor(base)];
    if (services.federation) sources.push(...await services.federation.listSources(base));
    return { sources };
  });

  app.get("/spatial/v1/sources/:sourceId", async (request) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    const base = publicBridgeUrl(request, config);
    if (sourceId === await services.spatial.sourceId()) return services.spatial.sourceDescriptor(base);
    if (services.federation) return services.federation.getSource(sourceId, base);
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections", async (request, reply) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.listCollections(publicBridgeUrl(request, config));
    if (services.federation) {
      const result = await services.federation.read(sourceId, "/collections");
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId", async (request, reply) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.getCollection(collectionId, publicBridgeUrl(request, config));
    if (services.federation) {
      const result = await services.federation.read(sourceId, `/collections/${encodeURIComponent(collectionId)}`);
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items", async (request, reply) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.listItems(collectionId);
    if (services.federation) {
      const result = await services.federation.read(sourceId, `/collections/${encodeURIComponent(collectionId)}/items`);
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items/:objectId", async (request, reply) => {
    await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId, objectId } = request.params as {
      sourceId: string;
      collectionId: string;
      objectId: string;
    };
    if (sourceId === await services.spatial.sourceId()) {
      const item = await services.spatial.getItem(collectionId, objectId);
      const revision = `sha256:${sha256(Buffer.from(stableStringify(item)))}`;
      reply.header("ETag", `"${revision}"`);
      reply.header("X-P4U-Revision", revision);
      return item;
    }
    if (services.federation) {
      const result = await services.federation.read(
        sourceId,
        `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(objectId)}`,
      );
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
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

  app.post("/spatial/v1/operations", async (request) => {
    const action = operationAction(request.body);
    await authenticatedDevice(request, services, spatialActionScope(action));
    const body = request.body as Record<string, unknown>;
    const target = body.target as Record<string, unknown> | undefined;
    const sourceId = typeof target?.sourceId === "string" ? target.sourceId : "";
    if (sourceId === await services.spatial.sourceId()) {
      if (!config.spatialWritable) {
        throw new BridgeError(
          403,
          "SOURCE_READ_ONLY",
          config.repositoryProfile === "rchkb"
            ? "RCHKB Spatial projection is read-only. Apply knowledge changes through the RCHKB workflow."
            : "Spatial source is configured read-only.",
        );
      }
      return services.spatialWrite.submit(request.body);
    }
    if (services.federation) return services.federation.submitOperation(request.body, publicBridgeUrl(request, config));
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/operations/:operationId", async (request) => {
    await authenticatedDevice(request, services);
    const { operationId } = request.params as { operationId: string };
    try {
      return await services.spatialWrite.get(operationId);
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== "OPERATION_NOT_FOUND" || !services.federation) throw error;
      return services.federation.getOperation(operationId);
    }
  });

  app.put("/api/v1/scans/:scanId/candidates/:candidateId", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    const { scanId, candidateId } = request.params as { scanId: string; candidateId: string };
    const body = request.body as Record<string, unknown>;
    assertOrThrow(body && typeof body === "object" && !Array.isArray(body), 400, "CANDIDATE_INVALID", "Candidate JSON object required.");
    if ("candidateId" in body) {
      assertOrThrow(body.candidateId === candidateId, 400, "CANDIDATE_INVALID", "Body candidateId must match URL candidateId.");
    } else {
      body.candidateId = candidateId;
    }
    return { candidate: await services.candidates.submit(scanId, principalId(device.deviceId), body) };
  });

  app.get("/api/v1/admin/xr/candidates", async (request) => {
    requireAdmin(request, config);
    const query = request.query as { state?: string };
    return { candidates: await services.candidates.list(query.state) };
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId", async (request) => {
    requireAdmin(request, config);
    const { candidateId } = request.params as { candidateId: string };
    return { candidate: await services.candidates.get(candidateId) };
  });

  app.put("/api/v1/admin/xr/candidates/:candidateId/review", async (request) => {
    requireAdmin(request, config);
    const { candidateId } = request.params as { candidateId: string };
    return { candidate: await services.candidates.review(candidateId, request.body) };
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId/operation-draft", async (request) => {
    requireAdmin(request, config);
    const { candidateId } = request.params as { candidateId: string };
    return services.candidates.operationDraft(candidateId);
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId/promotion-preview", async (request) => {
    requireAdmin(request, config);
    const { candidateId } = request.params as { candidateId: string };
    if (!config.spatialWritable) {
      throw new BridgeError(
        403,
        "SOURCE_READ_ONLY",
        config.repositoryProfile === "rchkb"
          ? "RCHKB Spatial projection is read-only. Apply accepted candidate knowledge through the RCHKB workflow."
          : "Spatial source is configured read-only.",
      );
    }
    const preview = await services.candidates.promotionPreview(candidateId);
    const operation = preview.operation as Record<string, unknown>;
    const target = operation.target as Record<string, unknown>;
    if (target.sourceId !== await services.spatial.sourceId()) {
      throw new BridgeError(404, "SOURCE_NOT_FOUND", "Candidate promotion target is not the local Spatial source.");
    }
    return preview;
  });

  app.post("/api/v1/admin/xr/candidates/:candidateId/promote", async (request) => {
    requireAdmin(request, config);
    if (!config.spatialWritable) {
      throw new BridgeError(
        403,
        "SOURCE_READ_ONLY",
        config.repositoryProfile === "rchkb"
          ? "RCHKB Spatial projection is read-only. Apply accepted candidate knowledge through the RCHKB workflow."
          : "Spatial source is configured read-only.",
      );
    }

    const { candidateId } = request.params as { candidateId: string };
    const body = request.body as { confirmationToken?: unknown };
    const preview = await services.candidates.assertPromotionConfirmation(
      candidateId,
      typeof body?.confirmationToken === "string" ? body.confirmationToken : "",
    );
    const operation = preview.operation as Record<string, unknown>;
    const target = operation.target as Record<string, unknown>;
    if (target.sourceId !== await services.spatial.sourceId()) {
      throw new BridgeError(404, "SOURCE_NOT_FOUND", "Candidate promotion target is not the local Spatial source.");
    }

    const result = await services.spatialWrite.submit(operation);
    await services.candidates.markPromoted(
      candidateId,
      preview.confirmationToken as string,
      result as unknown as Record<string, unknown>,
    );
    return { candidateId, operation: result };
  });

  app.post("/api/v1/admin/federation/retry", async (request) => {
    requireAdmin(request, config);
    if (!services.federation) throw new BridgeError(404, "FEDERATION_NOT_CONFIGURED", "Federation upstream is not configured.");
    return services.federation.retryPending();
  });

  app.post("/api/v1/admin/pairings", async (request) => {
    requireAdmin(request, config);
    return services.pairings.create(publicBridgeUrl(request, config));
  });

  app.get("/api/v1/admin/devices", async (request) => {
    requireAdmin(request, config);
    return { devices: await services.devices.list() };
  });

  app.get("/api/v1/admin/scopes", async (request) => {
    requireAdmin(request, config);
    return { scopes: CANONICAL_DEVICE_SCOPES };
  });

  app.put("/api/v1/admin/devices/:deviceId/scopes", async (request) => {
    requireAdmin(request, config);
    const { deviceId } = request.params as { deviceId: string };
    const body = request.body as { scopes?: unknown };
    assertOrThrow(Array.isArray(body?.scopes) && body.scopes.every(isDeviceScope), 400, "INVALID_REQUEST", "scopes must be an array of supported scopes.");
    return { device: await services.devices.setScopes(deviceId, body.scopes as DeviceScope[]) };
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
