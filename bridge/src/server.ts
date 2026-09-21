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
import {
  FederationDelegationService,
  type SubjectTokenProvider,
} from "./services/federation-delegation-service.js";
import { InstanceIdentityService } from "./services/instance-identity.js";
import { PairingService } from "./services/pairing-service.js";
import { ScanUploadService } from "./services/scan-upload-service.js";
import { SessionService } from "./services/session-service.js";
import { SpatialReadService } from "./services/spatial-read-service.js";
import { SpatialArtifactService } from "./services/spatial-artifact-service.js";
import { SpatialWriteService, type SpatialWriteAction } from "./services/spatial-write-service.js";
import { XrAppReleaseService } from "./services/xr-app-release-service.js";
import { CandidateReviewService } from "./services/candidate-review-service.js";
import { FixedWindowRateLimiter } from "./services/rate-limiter.js";
import { AdminPasskeyService } from "./services/admin-passkey-service.js";
import { AdminUserService } from "./services/admin-user-service.js";
import { AdminSessionService } from "./services/admin-session-service.js";
import { AdminPasswordTotpService } from "./services/admin-password-totp-service.js";
import { normalizeRelativePath, safeEqual, sha256, stableStringify } from "./util.js";
import { adminPage } from "./web/admin-page.js";
import QRCode from "qrcode-svg";
import type { BridgeConfigStore } from "./services/bridge-config-store.js";
import { SetupBootstrapService } from "./services/setup-bootstrap-service.js";

interface Services {
  devices: DeviceRegistry;
  identity: InstanceIdentityService;
  pairings: PairingService;
  sessions: SessionService;
  scans: ScanUploadService;
  spatial: SpatialReadService;
  artifacts: SpatialArtifactService;
  spatialWrite: SpatialWriteService;
  xrAppReleases: XrAppReleaseService;
  candidates: CandidateReviewService;
  federation?: FederationService;
  federationDelegation?: FederationDelegationService;
  adminPasskeys?: AdminPasskeyService;
  adminUsers: AdminUserService;
  adminSessions: AdminSessionService;
  adminPasswordTotp: AdminPasswordTotpService;
  setupBootstrap: SetupBootstrapService;
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

interface AdminPrincipal {
  via: "key" | "session";
  userId?: string;
  sessionToken?: string;
}

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

function adminSessionToken(request: FastifyRequest): string | undefined {
  const supplied = request.headers["x-p4u-admin-session"];
  const headerToken = Array.isArray(supplied) ? supplied[0] : supplied;
  return headerToken ?? cookieValue(request, "p4u_admin_session");
}

function setAdminSessionCookie(reply: FastifyReply, token: string, csrfToken: string, expiresAt: string): void {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  reply.header("Set-Cookie", [
    `p4u_admin_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`,
    `p4u_admin_csrf=${encodeURIComponent(csrfToken)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict`,
  ]);
}

function clearAdminSessionCookie(reply: FastifyReply): void {
  reply.header("Set-Cookie", [
    "p4u_admin_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
    "p4u_admin_csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict",
  ]);
}

async function requireAdmin(request: FastifyRequest, config: BridgeConfig, services: Services): Promise<AdminPrincipal> {
  const supplied = request.headers["x-p4u-admin-key"];
  const adminKey = Array.isArray(supplied) ? supplied[0] : supplied;
  if (config.adminKey && adminKey && safeEqual(config.adminKey, adminKey)) return { via: "key" };

  const token = adminSessionToken(request);
  if (!token) throw new BridgeError(401, "ADMIN_UNAUTHORIZED", "Administrator authentication required.");
  const userId = await services.adminSessions.userId(token);
  if (!userId) throw new BridgeError(401, "ADMIN_SESSION_EXPIRED", "Administrator session is invalid or expired.");
  const user = await services.adminUsers.get(userId);
  if (!user || user.status !== "active") throw new BridgeError(403, "ADMIN_USER_DISABLED", "Administrator user is disabled.");

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const suppliedCsrf = request.headers["x-p4u-csrf"];
    const csrf = Array.isArray(suppliedCsrf) ? suppliedCsrf[0] : suppliedCsrf;
    assertOrThrow(csrf && await services.adminSessions.verifyCsrf(token, csrf), 403, "CSRF_INVALID", "Valid CSRF token required.");
  }

  return { via: "session", userId, sessionToken: token };
}

async function credentialUserId(principal: AdminPrincipal, requestedUserId: unknown, services: Services): Promise<string> {
  if (principal.userId) {
    if (typeof requestedUserId === "string" && requestedUserId !== principal.userId) {
      throw new BridgeError(403, "ADMIN_USER_MISMATCH", "Credential management is limited to the signed-in user.");
    }
    return principal.userId;
  }
  assertOrThrow(typeof requestedUserId === "string", 400, "USER_ID_REQUIRED", "userId is required for administrator-key credential management.");
  const user = await services.adminUsers.get(requestedUserId);
  assertOrThrow(user && user.status === "active", 404, "USER_NOT_FOUND", "Active administrator user not found.");
  return user.userId;
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

// ADR: docs/adr/contracts/0027-separate-xr-app-contract.md — discovery exposes XR runtime and XR application lifecycle as separate contracts.
export function buildServer(
  config: BridgeConfig,
  repository: RepositoryProvider,
  options: {
    configStore?: BridgeConfigStore;
    federationSubjectTokenProvider?: SubjectTokenProvider;
  } = {},
): FastifyInstance {
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

  const federationAccessMode = config.federationAccessMode
    ?? (config.federationToken ? "service" : "anonymous");

  let federationDelegation: FederationDelegationService | undefined;
  if (config.federationUpstreamUrl && federationAccessMode === "delegated-user") {
    if (!config.federationDelegationMethod || !config.federationOAuthTokenUrl || !config.federationOAuthClientId) {
      throw new Error("Delegated federation requires method, token URL and OAuth client ID.");
    }
    if (config.federationDelegationMethod === "authorization-code-pkce" && !config.federationOAuthAuthorizationUrl) {
      throw new Error("Authorization Code + PKCE requires an OAuth authorization URL.");
    }
    federationDelegation = new FederationDelegationService(
      config.stateDir,
      {
        routeId: config.federationRouteId,
        method: config.federationDelegationMethod,
        tokenUrl: config.federationOAuthTokenUrl,
        clientId: config.federationOAuthClientId,
        ...(config.federationOAuthClientSecret ? { clientSecret: config.federationOAuthClientSecret } : {}),
        ...(config.federationOAuthAuthorizationUrl ? { authorizationUrl: config.federationOAuthAuthorizationUrl } : {}),
        ...(config.federationOAuthScopes ? { scopes: config.federationOAuthScopes } : {}),
        ...(config.federationOAuthAudience ? { audience: config.federationOAuthAudience } : {}),
      },
      options.federationSubjectTokenProvider,
    );
  }

  const federation = config.federationUpstreamUrl
    ? new FederationService(
        config.stateDir,
        {
          upstreamUrl: config.federationUpstreamUrl,
          routeId: config.federationRouteId,
          accessMode: federationAccessMode,
          ...(federationAccessMode === "service" && config.federationToken ? { token: config.federationToken } : {}),
          retryBaseSeconds: config.federationRetryBaseSeconds,
          retryMaxSeconds: config.federationRetryMaxSeconds,
          relayRetentionSeconds: config.federationRelayRetentionSeconds,
        },
        federationDelegation,
      )
    : undefined;

  const scans = new ScanUploadService(config.stateDir, repository, config.spatialRoot, {
    maxFiles: config.scanMaxFiles,
    maxFileBytes: config.scanMaxFileBytes,
    maxTotalBytes: config.scanMaxTotalBytes,
  }, config.scanUploadRetentionSeconds);

  const artifacts = new SpatialArtifactService(
    config.stateDir,
    repository,
    config.spatialRoot,
    () => spatial.sourceId(),
    config.scanMaxFileBytes,
  );

  const spatialWrite = new SpatialWriteService(
    config.stateDir,
    repository,
    config.spatialRoot,
    () => spatial.sourceId(),
    (payload) => artifacts.assertReferencesReady(payload),
  );
  const pairingClaimLimiter = new FixedWindowRateLimiter(config.pairingClaimRateLimit, 60_000);
  const sessionRefreshLimiter = new FixedWindowRateLimiter(config.sessionRefreshRateLimit, 60_000);
  const scanRequestLimiter = new FixedWindowRateLimiter(config.scanRequestRateLimit, 60_000);
  const adminLoginLimiter = new FixedWindowRateLimiter(10, 60_000);

  const services: Services = {
    devices: new DeviceRegistry(config.stateDir),
    identity: new InstanceIdentityService(config.stateDir),
    pairings: new PairingService(config.stateDir, config.pairingTtlSeconds),
    sessions: new SessionService(config.stateDir, config.accessTokenTtlSeconds, config.refreshTokenTtlSeconds),
    scans,
    spatial,
    artifacts,
    spatialWrite,
    xrAppReleases: new XrAppReleaseService(config.stateDir),
    candidates: new CandidateReviewService(config.stateDir, (scanId) => scans.isCommitted(scanId)),
    adminUsers: new AdminUserService(config.stateDir),
    adminSessions: new AdminSessionService(config.stateDir),
    adminPasswordTotp: new AdminPasswordTotpService(config.stateDir),
    setupBootstrap: new SetupBootstrapService(config.stateDir),
    ...(federation ? { federation } : {}),
    ...(federationDelegation ? { federationDelegation } : {}),
    ...(config.adminWebauthnRpId && config.adminWebauthnOrigin
      ? { adminPasskeys: new AdminPasskeyService(config.stateDir, config.adminWebauthnRpId, config.adminWebauthnOrigin) }
      : {}),
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

  app.get("/api/v1/setup/status", async () => {
    const users = await services.adminUsers.list();
    const passkeyConfigured = services.adminPasskeys ? await services.adminPasskeys.configured() : false;
    const passwordTotpConfigured = await services.adminPasswordTotp.anyEnabled();
    const bootstrap = await services.setupBootstrap.status();
    return {
      setupRequired: users.length === 0 || (!passkeyConfigured && !passwordTotpConfigured),
      proofAvailable: bootstrap.available,
      userCount: users.length,
    };
  });

  app.post("/api/v1/setup/admin", async (request, reply) => {
    const body = request.body as { proof?: unknown; username?: unknown; displayName?: unknown };
    assertOrThrow(typeof body?.proof === "string", 400, "INVALID_REQUEST", "proof is required.");
    await services.setupBootstrap.verify(body.proof);

    const users = await services.adminUsers.list();
    const anyPasskey = services.adminPasskeys ? await services.adminPasskeys.configured() : false;
    const anyPasswordTotp = await services.adminPasswordTotp.anyEnabled();
    assertOrThrow(!anyPasskey && !anyPasswordTotp, 409, "SETUP_COMPLETE", "A permanent administrator login method already exists.");

    let user;
    if (users.length === 0) {
      assertOrThrow(typeof body.username === "string", 400, "INVALID_REQUEST", "username is required.");
      user = await services.adminUsers.create(body.username, typeof body.displayName === "string" ? body.displayName : undefined);
    } else {
      assertOrThrow(users.length === 1, 409, "SETUP_STATE_INVALID", "First-run setup cannot select between multiple administrator users.");
      user = users[0]!;
    }

    const session = await services.adminSessions.issue(user.userId);
    setAdminSessionCookie(reply, session.token, session.csrfToken, session.expiresAt);
    return { user, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  });

  const sendAdminPage = (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    return reply.type("text/html; charset=utf-8").send(adminPage());
  };

  app.get("/admin", sendAdminPage);
  app.get("/admin/credentials", sendAdminPage);
  app.get("/admin/settings", sendAdminPage);

  app.get("/api/v1/admin-auth/status", async () => ({
    passkeyEnabled: !!services.adminPasskeys,
    passkeyConfigured: services.adminPasskeys ? await services.adminPasskeys.configured() : false,
    passwordTotpConfigured: await services.adminPasswordTotp.anyEnabled(),
  }));

  app.get("/api/v1/admin-auth/me", async (request) => {
    const principal = await requireAdmin(request, config, services);
    assertOrThrow(principal.userId, 401, "ADMIN_SESSION_REQUIRED", "A signed-in administrator session is required.");
    const user = await services.adminUsers.get(principal.userId);
    assertOrThrow(user, 401, "ADMIN_UNAUTHORIZED", "Administrator user no longer exists.");
    return {
      user,
      loginMethods: {
        passkey: services.adminPasskeys ? await services.adminPasskeys.configured(user.userId) : false,
        passwordTotp: await services.adminPasswordTotp.enabled(user.userId),
      },
    };
  });

  app.post("/api/v1/admin-auth/register/options", async (request) => {
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    const body = request.body as { userId?: unknown };
    const principal = await requireAdmin(request, config, services);
    const userId = await credentialUserId(principal, body?.userId, services);
    const user = await services.adminUsers.get(userId);
    assertOrThrow(user && user.status === "active", 404, "USER_NOT_FOUND", "Active administrator user not found.");
    return services.adminPasskeys.registrationOptions(user);
  });

  app.post("/api/v1/admin-auth/register/verify", async (request) => {
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    await requireAdmin(request, config, services);
    const body = request.body as { ceremonyId?: unknown; response?: unknown; name?: unknown };
    assertOrThrow(typeof body?.ceremonyId === "string" && body.response && typeof body.response === "object", 400, "INVALID_REQUEST", "ceremonyId and response are required.");
    const passkey = await services.adminPasskeys.verifyRegistration(body.ceremonyId, body.response as any, typeof body.name === "string" ? body.name : undefined);
    await services.setupBootstrap.consume();
    return { passkey: { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt } };
  });

  app.post("/api/v1/admin-auth/login/options", async (request) => {
    adminLoginLimiter.consume(`ip:${request.ip}:passkey-options`);
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    return services.adminPasskeys.authenticationOptions();
  });

  app.post("/api/v1/admin-auth/login/verify", async (request, reply) => {
    adminLoginLimiter.consume(`ip:${request.ip}:passkey-verify`);
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    const body = request.body as { ceremonyId?: unknown; response?: unknown };
    assertOrThrow(typeof body?.ceremonyId === "string" && body.response && typeof body.response === "object", 400, "INVALID_REQUEST", "ceremonyId and response are required.");
    const authenticated = await services.adminPasskeys.verifyAuthentication(body.ceremonyId, body.response as any);
    const user = await services.adminUsers.get(authenticated.userId);
    assertOrThrow(user && user.status === "active", 403, "ADMIN_USER_DISABLED", "Administrator user is disabled.");
    const session = await services.adminSessions.issue(user.userId);
    setAdminSessionCookie(reply, session.token, session.csrfToken, session.expiresAt);
    return { user, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  });

  app.post("/api/v1/admin-auth/password-totp/setup", async (request) => {
    const principal = await requireAdmin(request, config, services);
    const body = request.body as { userId?: unknown; password?: unknown };
    assertOrThrow(typeof body?.password === "string", 400, "INVALID_REQUEST", "password is required.");
    const userId = await credentialUserId(principal, body.userId, services);
    const user = await services.adminUsers.get(userId);
    assertOrThrow(user && user.status === "active", 404, "USER_NOT_FOUND", "Active administrator user not found.");
    return services.adminPasswordTotp.beginSetup(user.userId, user.username, body.password);
  });

  app.post("/api/v1/admin-auth/password-totp/setup/confirm", async (request) => {
    await requireAdmin(request, config, services);
    const body = request.body as { setupId?: unknown; code?: unknown };
    assertOrThrow(typeof body?.setupId === "string" && typeof body.code === "string", 400, "INVALID_REQUEST", "setupId and code are required.");
    await services.adminPasswordTotp.confirmSetup(body.setupId, body.code);
    await services.setupBootstrap.consume();
    return { enabled: true };
  });

  app.post("/api/v1/admin-auth/password-totp/login", async (request, reply) => {
    adminLoginLimiter.consume(`ip:${request.ip}:password-totp`);
    const body = request.body as { username?: unknown; password?: unknown; totp?: unknown };
    assertOrThrow(typeof body?.username === "string" && typeof body.password === "string" && typeof body.totp === "string", 400, "INVALID_REQUEST", "username, password and totp are required.");
    adminLoginLimiter.consume(`user:${body.username.trim().toLowerCase()}`);
    const user = await services.adminUsers.getByUsername(body.username);
    assertOrThrow(user && user.status === "active", 401, "ADMIN_LOGIN_FAILED", "Invalid administrator credentials.");
    const verified = await services.adminPasswordTotp.verify(user.userId, body.password, body.totp);
    assertOrThrow(verified, 401, "ADMIN_LOGIN_FAILED", "Invalid administrator credentials.");
    const session = await services.adminSessions.issue(user.userId);
    setAdminSessionCookie(reply, session.token, session.csrfToken, session.expiresAt);
    return { user, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  });

  app.delete("/api/v1/admin-auth/password-totp", async (request) => {
    const principal = await requireAdmin(request, config, services);
    const body = request.body as { userId?: unknown } | undefined;
    const userId = await credentialUserId(principal, body?.userId, services);
    assertOrThrow(services.adminPasskeys && await services.adminPasskeys.configured(userId), 409, "LOGIN_METHOD_REQUIRED", "Register a passkey before disabling password + TOTP.");
    await services.adminPasswordTotp.disable(userId);
    return { enabled: false };
  });

  app.post("/api/v1/admin-auth/logout", async (request, reply) => {
    const token = adminSessionToken(request);
    if (token) {
      await requireAdmin(request, config, services);
      await services.adminSessions.revoke(token);
    }
    clearAdminSessionCookie(reply);
    return { status: "logged-out" };
  });

  app.get("/api/v1/admin-auth/passkeys", async (request) => {
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    const principal = await requireAdmin(request, config, services);
    const query = request.query as { userId?: unknown };
    const userId = await credentialUserId(principal, query?.userId, services);
    return { passkeys: await services.adminPasskeys.listPasskeys(userId) };
  });

  app.put("/api/v1/admin-auth/passkeys/:passkeyId", async (request) => {
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    const principal = await requireAdmin(request, config, services);
    const { passkeyId } = request.params as { passkeyId: string };
    const body = request.body as { name?: unknown; userId?: unknown };
    assertOrThrow(typeof body?.name === "string", 400, "INVALID_REQUEST", "name is required.");
    const userId = await credentialUserId(principal, body.userId, services);
    return { passkey: await services.adminPasskeys.renamePasskey(userId, passkeyId, body.name) };
  });

  app.delete("/api/v1/admin-auth/passkeys/:passkeyId", async (request) => {
    assertOrThrow(services.adminPasskeys, 503, "PASSKEY_DISABLED", "Passkey authentication is not configured.");
    const principal = await requireAdmin(request, config, services);
    const { passkeyId } = request.params as { passkeyId: string };
    const body = request.body as { userId?: unknown } | undefined;
    const userId = await credentialUserId(principal, body?.userId, services);
    const fallbackEnabled = await services.adminPasswordTotp.enabled(userId);
    return { removed: await services.adminPasskeys.removePasskey(userId, passkeyId, fallbackEnabled) };
  });

  app.get("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request, config, services);
    assertOrThrow(options.configStore, 503, "CONFIG_STORE_UNAVAILABLE", "Persistent Bridge configuration is not available in this runtime.");
    return {
      config: await options.configStore.publicView(),
      restartRequired: false,
    };
  });

  app.put("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request, config, services);
    assertOrThrow(options.configStore, 503, "CONFIG_STORE_UNAVAILABLE", "Persistent Bridge configuration is not available in this runtime.");
    assertOrThrow(request.body && typeof request.body === "object" && !Array.isArray(request.body), 400, "INVALID_REQUEST", "JSON object required.");
    return options.configStore.update(request.body as Record<string, unknown>);
  });

  app.get("/health", async () => ({
    status: "ok",
    repository: repository.kind,
    federation: services.federation ? "configured" : "disabled",
  }));

  app.get("/ready", async (_request, reply) => {
    const checks: Record<string, { ready: boolean; detail?: string }> = {};
    try {
      await services.identity.get();
      checks.state = { ready: true };
    } catch (error) {
      checks.state = { ready: false, detail: String((error as Error).message) };
    }
    checks.repository = await repository.probe();

    const ready = Object.values(checks).every((check) => check.ready);
    if (!ready) reply.status(503);
    return {
      status: ready ? "ready" : "not-ready",
      checks,
      federation: services.federation ? "configured-not-required" : "disabled",
    };
  });

  app.get("/.well-known/open-spatial-interop", async (request) => {
    const base = publicBridgeUrl(request, config);
    const instance = await services.identity.getInfo();
    return {
      protocolId: "open-spatial-interop",
      coreVersion: "0.1",
      instanceId: instance.instanceId,
      instanceName: instance.name,
      addresses: {
        ...(config.localBaseUrl ? { localUrl: config.localBaseUrl } : {}),
        ...(config.publicBaseUrl ? { publicUrl: config.publicBaseUrl } : {}),
      },
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
        "spatial.artifacts.read",
        ...(config.spatialWritable
          ? ["spatial.create", "spatial.update", "spatial.delete", "spatial.artifacts.write"]
          : []),
        ...(services.federation ? ["federation.read", "federation.cache", "federation.durable-relay"] : []),
        "xr.pairing",
        "xr.device",
        "xr.display.read",
        "xr.scan.write",
        "xr.observation.write",
        "xr-app.update",
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
    await requireAdmin(request, config, services);
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
      displayName: device.globalName ?? device.name ?? `${device.platform} ${device.model}`,
      localDeviceName: device.name,
      globalDeviceName: device.globalName,
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
    const device = await authenticatedDevice(request, services, "spatial.read");
    const base = publicBridgeUrl(request, config);
    const sources: Array<Record<string, unknown>> = [await services.spatial.sourceDescriptor(base)];
    if (services.federation) sources.push(...await services.federation.listSources(base, device.assignedUserId));
    return { sources };
  });

  app.get("/spatial/v1/sources/:sourceId", async (request) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    const base = publicBridgeUrl(request, config);
    if (sourceId === await services.spatial.sourceId()) return services.spatial.sourceDescriptor(base);
    if (services.federation) return services.federation.getSource(sourceId, base, device.assignedUserId);
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections", async (request, reply) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { sourceId } = request.params as { sourceId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.listCollections(publicBridgeUrl(request, config));
    if (services.federation) {
      const result = await services.federation.read(sourceId, "/collections", device.assignedUserId);
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId", async (request, reply) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.getCollection(collectionId, publicBridgeUrl(request, config));
    if (services.federation) {
      const result = await services.federation.read(sourceId, `/collections/${encodeURIComponent(collectionId)}`, device.assignedUserId);
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items", async (request, reply) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
    const { sourceId, collectionId } = request.params as { sourceId: string; collectionId: string };
    if (sourceId === await services.spatial.sourceId()) return services.spatial.listItems(collectionId);
    if (services.federation) {
      const result = await services.federation.read(sourceId, `/collections/${encodeURIComponent(collectionId)}/items`, device.assignedUserId);
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/collections/:collectionId/items/:objectId", async (request, reply) => {
    const device = await authenticatedDevice(request, services, "spatial.read");
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
        device.assignedUserId,
      );
      applyFederatedReadHeaders(reply, result);
      return result.body;
    }
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/sources/:sourceId/artifacts/:artifactId", async (request) => {
    await authenticatedDevice(request, services, "spatial.artifacts.read");
    const { sourceId, artifactId } = request.params as { sourceId: string; artifactId: string };
    return services.artifacts.getDescriptor(sourceId, artifactId, publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/sources/:sourceId/artifacts/:artifactId/content", async (request, reply) => {
    await authenticatedDevice(request, services, "spatial.artifacts.read");
    const { sourceId, artifactId } = request.params as { sourceId: string; artifactId: string };
    const artifact = await services.artifacts.getContent(sourceId, artifactId);
    reply.header("ETag", `"sha256:${artifact.metadata.sha256}"`);
    reply.header("Content-Length", artifact.metadata.size.toString());
    return reply.type(artifact.metadata.mediaType).send(Buffer.from(artifact.content));
  });

  app.post("/spatial/v1/sources/:sourceId/artifact-uploads", async (request) => {
    await authenticatedDevice(request, services, "spatial.artifacts.write");
    if (!config.spatialWritable) {
      throw new BridgeError(403, "SOURCE_READ_ONLY", "Spatial source is configured read-only.");
    }
    const { sourceId } = request.params as { sourceId: string };
    return services.artifacts.createUpload(sourceId, request.body, publicBridgeUrl(request, config));
  });

  app.get("/spatial/v1/sources/:sourceId/artifact-uploads/:uploadId", async (request) => {
    await authenticatedDevice(request, services, "spatial.artifacts.write");
    const { sourceId, uploadId } = request.params as { sourceId: string; uploadId: string };
    return services.artifacts.status(sourceId, uploadId, publicBridgeUrl(request, config));
  });

  app.put("/spatial/v1/sources/:sourceId/artifact-uploads/:uploadId/content", async (request) => {
    await authenticatedDevice(request, services, "spatial.artifacts.write");
    if (!config.spatialWritable) {
      throw new BridgeError(403, "SOURCE_READ_ONLY", "Spatial source is configured read-only.");
    }
    assertOrThrow(Buffer.isBuffer(request.body), 400, "INVALID_REQUEST", "Binary artifact request body required.");
    const { sourceId, uploadId } = request.params as { sourceId: string; uploadId: string };
    const header = request.headers["x-content-sha256"];
    const declared = Array.isArray(header) ? header[0] : header;
    return services.artifacts.putContent(
      sourceId,
      uploadId,
      request.body,
      declared,
      publicBridgeUrl(request, config),
    );
  });

  app.post("/spatial/v1/sources/:sourceId/artifact-uploads/:uploadId/commit", async (request) => {
    await authenticatedDevice(request, services, "spatial.artifacts.write");
    if (!config.spatialWritable) {
      throw new BridgeError(403, "SOURCE_READ_ONLY", "Spatial source is configured read-only.");
    }
    const { sourceId, uploadId } = request.params as { sourceId: string; uploadId: string };
    return services.artifacts.commit(sourceId, uploadId, publicBridgeUrl(request, config));
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
    const device = await authenticatedDevice(request, services, spatialActionScope(action));
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
    if (services.federation) return services.federation.submitOperation(request.body, publicBridgeUrl(request, config), device.assignedUserId);
    throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
  });

  app.get("/spatial/v1/operations/:operationId", async (request) => {
    const device = await authenticatedDevice(request, services);
    const { operationId } = request.params as { operationId: string };
    try {
      return await services.spatialWrite.get(operationId);
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== "OPERATION_NOT_FOUND" || !services.federation) throw error;
      return services.federation.getOperation(operationId, device.assignedUserId);
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
    await requireAdmin(request, config, services);
    const query = request.query as { state?: string };
    return { candidates: await services.candidates.list(query.state) };
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId", async (request) => {
    await requireAdmin(request, config, services);
    const { candidateId } = request.params as { candidateId: string };
    return { candidate: await services.candidates.get(candidateId) };
  });

  app.put("/api/v1/admin/xr/candidates/:candidateId/review", async (request) => {
    await requireAdmin(request, config, services);
    const { candidateId } = request.params as { candidateId: string };
    return { candidate: await services.candidates.review(candidateId, request.body) };
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId/operation-draft", async (request) => {
    await requireAdmin(request, config, services);
    const { candidateId } = request.params as { candidateId: string };
    return services.candidates.operationDraft(candidateId);
  });

  app.get("/api/v1/admin/xr/candidates/:candidateId/promotion-preview", async (request) => {
    await requireAdmin(request, config, services);
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
    await requireAdmin(request, config, services);
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

  app.post("/api/v1/admin/xr/scans/cleanup", async (request) => {
    await requireAdmin(request, config, services);
    return services.scans.cleanupStale();
  });

  app.post("/api/v1/admin/federation/retry", async (request) => {
    await requireAdmin(request, config, services);
    if (!services.federation) throw new BridgeError(404, "FEDERATION_NOT_CONFIGURED", "Federation upstream is not configured.");
    return services.federation.retryPending();
  });

  app.post("/api/v1/admin/federation/cleanup", async (request) => {
    await requireAdmin(request, config, services);
    if (!services.federation) throw new BridgeError(404, "FEDERATION_NOT_CONFIGURED", "Federation upstream is not configured.");
    return services.federation.cleanupRelays();
  });

  app.get("/api/v1/admin/metrics", async (request) => {
    await requireAdmin(request, config, services);
    return {
      federation: services.federation ? await services.federation.metrics() : null,
    };
  });

  app.get("/api/v1/admin/pairing-claims", async (request) => {
    await requireAdmin(request, config, services);
    return { claims: await services.pairings.listPending() };
  });

  app.post("/api/v1/admin/pairings", async (request) => {
    await requireAdmin(request, config, services);
    const publicUrl = config.publicBaseUrl?.replace(/\/$/, "") ?? publicBridgeUrl(request, config);
    const localUrl = config.localBaseUrl?.replace(/\/$/, "");
    const pairing = await services.pairings.create(publicUrl, {
      ...(localUrl ? { localUrl } : {}),
      ...(publicUrl ? { publicUrl } : {}),
    });
    const qrSvg = new QRCode({
      content: JSON.stringify(pairing),
      padding: 4,
      width: 384,
      height: 384,
      color: "#000000",
      background: "#ffffff",
      ecl: "M",
      join: true,
      container: "svg-viewbox",
      xmlDeclaration: false,
    }).svg();
    return { ...pairing, qrSvg };
  });

  app.get("/api/v1/admin/devices", async (request) => {
    await requireAdmin(request, config, services);
    return { devices: await services.devices.list() };
  });

  app.put("/api/v1/admin/instance/name", async (request) => {
    await requireAdmin(request, config, services);
    const body = request.body as { name?: unknown };
    assertOrThrow(typeof body?.name === "string" && body.name.trim().length > 0 && body.name.trim().length <= 120, 400, "INVALID_REQUEST", "name must contain 1 to 120 characters.");
    return { instance: await services.identity.setName(body.name) };
  });

  app.put("/api/v1/admin/devices/:deviceId/name", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    const body = request.body as { name?: unknown };
    assertOrThrow(typeof body?.name === "string", 400, "INVALID_REQUEST", "name must be a string.");
    return { device: await services.devices.setGlobalName(deviceId, body.name) };
  });

  app.get("/api/v1/admin/users", async (request) => {
    await requireAdmin(request, config, services);
    return { users: await services.adminUsers.list() };
  });

  app.post("/api/v1/admin/users", async (request) => {
    await requireAdmin(request, config, services);
    const body = request.body as { username?: unknown; displayName?: unknown };
    assertOrThrow(typeof body?.username === "string", 400, "INVALID_REQUEST", "username is required.");
    return { user: await services.adminUsers.create(body.username, typeof body.displayName === "string" ? body.displayName : undefined) };
  });

  app.put("/api/v1/admin/users/:userId", async (request) => {
    await requireAdmin(request, config, services);
    const { userId } = request.params as { userId: string };
    const body = request.body as { displayName?: unknown; status?: unknown };
    assertOrThrow(body && typeof body === "object", 400, "INVALID_REQUEST", "JSON object required.");
    assertOrThrow(body.status === undefined || body.status === "active" || body.status === "disabled", 400, "INVALID_REQUEST", "status must be active or disabled.");
    const user = await services.adminUsers.update(userId, {
      ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
      ...(body.status === "active" || body.status === "disabled" ? { status: body.status } : {}),
    });
    if (user.status === "disabled") await services.adminSessions.revokeUser(user.userId);
    return { user };
  });

  app.put("/api/v1/admin/devices/:deviceId/user", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    const body = request.body as { userId?: unknown };
    assertOrThrow(body?.userId === null || typeof body?.userId === "string", 400, "INVALID_REQUEST", "userId must be a user ID or null.");
    if (typeof body.userId === "string") {
      const user = await services.adminUsers.get(body.userId);
      assertOrThrow(user, 404, "USER_NOT_FOUND", "User not found.");
      assertOrThrow(user.status === "active", 409, "USER_DISABLED", "Disabled users cannot receive device assignments.");
    }
    return { device: await services.devices.assignUser(deviceId, typeof body.userId === "string" ? body.userId : undefined) };
  });

  app.get("/api/v1/admin/scopes", async (request) => {
    await requireAdmin(request, config, services);
    return { scopes: CANONICAL_DEVICE_SCOPES };
  });

  app.put("/api/v1/admin/devices/:deviceId/scopes", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    const body = request.body as { scopes?: unknown };
    assertOrThrow(Array.isArray(body?.scopes) && body.scopes.every(isDeviceScope), 400, "INVALID_REQUEST", "scopes must be an array of supported scopes.");
    return { device: await services.devices.setScopes(deviceId, body.scopes as DeviceScope[]) };
  });

  app.post("/api/v1/admin/pairing-claims/:claimId/authorize", async (request) => {
    await requireAdmin(request, config, services);
    const { claimId } = request.params as { claimId: string };
    const descriptor = await services.pairings.pendingDescriptor(claimId);
    const device = await services.devices.authorize(descriptor);
    const bootstrap = await services.sessions.issue(device.deviceId);
    await services.pairings.authorize(claimId, bootstrap);
    return { device };
  });

  app.post("/api/v1/admin/pairing-claims/:claimId/reject", async (request) => {
    await requireAdmin(request, config, services);
    const { claimId } = request.params as { claimId: string };
    await services.pairings.reject(claimId);
    return { status: "rejected" };
  });

  app.post("/api/v1/admin/devices/:deviceId/enable", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    return { device: await services.devices.setStatus(deviceId, "authorized") };
  });

  app.post("/api/v1/admin/devices/:deviceId/disable", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    return { device: await services.devices.setStatus(deviceId, "disabled") };
  });

  app.post("/api/v1/admin/devices/:deviceId/revoke", async (request) => {
    await requireAdmin(request, config, services);
    const { deviceId } = request.params as { deviceId: string };
    const device = await services.devices.setStatus(deviceId, "revoked");
    await services.sessions.revokeDevice(deviceId);
    return { device };
  });

  app.post("/api/v1/pairing/claim", async (request) => {
    pairingClaimLimiter.consume(`ip:${request.ip}`);
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
    sessionRefreshLimiter.consume(`ip:${request.ip}`);
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
    scanRequestLimiter.consume(`device:${device.deviceId}`);
    const { scanId } = request.params as { scanId: string };
    return services.scans.putManifest(device.deviceId, scanId, request.body);
  });

  app.put("/api/v1/scans/:scanId/files/*", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    scanRequestLimiter.consume(`device:${device.deviceId}`);
    const params = request.params as { scanId: string; "*": string };
    assertOrThrow(Buffer.isBuffer(request.body), 400, "INVALID_REQUEST", "Binary request body required.");
    const header = request.headers["x-content-sha256"];
    const declared = Array.isArray(header) ? header[0] : header;
    return services.scans.putFile(device.deviceId, params.scanId, params["*"], request.body, declared);
  });

  app.post("/api/v1/scans/:scanId/commit", async (request) => {
    const device = await authenticatedDevice(request, services, "xr.scan.write");
    scanRequestLimiter.consume(`device:${device.deviceId}`);
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
