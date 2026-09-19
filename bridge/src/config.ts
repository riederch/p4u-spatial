import { resolve } from "node:path";

export interface BridgeConfig {
  host: string;
  port: number;
  publicBaseUrl?: string;
  adminKey?: string;
  stateDir: string;
  repositoryRoot: string;
  repositoryProvider: "filesystem" | "git";
  repositoryProfile: "generic" | "rchkb";
  rchkbRoot?: string;
  gitRemoteUrl?: string;
  gitBranch: string;
  gitUsername?: string;
  gitToken?: string;
  gitRefreshIntervalMs: number;
  federationUpstreamUrl?: string;
  federationToken?: string;
  federationRouteId: string;
  spatialRoot: string;
  spatialWritable: boolean;
  spatialRouteId: string;
  spatialSourceTitle: string;
  spatialSnapshotTtlSeconds: number;
  spatialOperationRetentionSeconds: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  pairingTtlSeconds: number;
  scanMaxFiles: number;
  scanMaxFileBytes: number;
  scanMaxTotalBytes: number;
  scanUploadRetentionSeconds: number;
  pairingClaimRateLimit: number;
  sessionRefreshRateLimit: number;
  scanRequestRateLimit: number;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be a boolean`);
}

function normalizedRchkbRoot(value: string): string {
  const root = value.replace(/^\/+|\/+$/g, "");
  if (!root || root === "." || root.split("/").some((part) => part === ".." || part === "." || part.length === 0)) {
    throw new Error("P4U_RCHKB_ROOT must be a repository-relative knowledge-base root");
  }
  return root;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function loadConfig(): BridgeConfig {
  const repositoryProfile = process.env.P4U_REPOSITORY_PROFILE === "rchkb" ? "rchkb" : "generic";
  const rchkbRoot = repositoryProfile === "rchkb"
    ? normalizedRchkbRoot(process.env.P4U_RCHKB_ROOT ?? "")
    : undefined;
  const spatialRoot = repositoryProfile === "rchkb"
    ? `${rchkbRoot}/_agents/spatial`
    : (process.env.P4U_SPATIAL_ROOT ?? "spatial");
  const spatialWritable = repositoryProfile === "rchkb"
    ? boolEnv("P4U_RCHKB_ALLOW_SPATIAL_WRITES", false)
    : boolEnv("P4U_SPATIAL_WRITABLE", true);

  const config: BridgeConfig = {
    host: process.env.P4U_HOST ?? "0.0.0.0",
    port: intEnv("P4U_PORT", 8787),
    stateDir: resolve(process.env.P4U_STATE_DIR ?? ".data/state"),
    repositoryRoot: resolve(process.env.P4U_REPOSITORY_ROOT ?? ".data/repository"),
    repositoryProvider: process.env.P4U_REPOSITORY_PROVIDER === "git" ? "git" : "filesystem",
    repositoryProfile,
    gitBranch: process.env.P4U_GIT_BRANCH ?? "main",
    gitRefreshIntervalMs: intEnv("P4U_GIT_REFRESH_INTERVAL_MS", 1000),
    federationRouteId: process.env.P4U_FEDERATION_ROUTE_ID ?? "upstream",
    spatialRoot,
    spatialWritable,
    spatialRouteId: repositoryProfile === "rchkb" ? "rchkb-git" : "git-repository",
    spatialSourceTitle: process.env.P4U_SPATIAL_SOURCE_TITLE
      ?? (repositoryProfile === "rchkb" ? `RCHKB Spatial: ${rchkbRoot}` : "P4U Spatial Repository"),
    spatialSnapshotTtlSeconds: intEnv("P4U_SPATIAL_SNAPSHOT_TTL", 10 * 60),
    spatialOperationRetentionSeconds: intEnv("P4U_SPATIAL_OPERATION_RETENTION", 7 * 24 * 60 * 60),
    accessTokenTtlSeconds: intEnv("P4U_ACCESS_TOKEN_TTL", 30 * 60),
    refreshTokenTtlSeconds: intEnv("P4U_REFRESH_TOKEN_TTL", 30 * 24 * 60 * 60),
    pairingTtlSeconds: intEnv("P4U_PAIRING_TTL", 5 * 60),
    scanMaxFiles: intEnv("P4U_SCAN_MAX_FILES", 256),
    scanMaxFileBytes: intEnv("P4U_SCAN_MAX_FILE_BYTES", 64 * 1024 * 1024),
    scanMaxTotalBytes: intEnv("P4U_SCAN_MAX_TOTAL_BYTES", 512 * 1024 * 1024),
    scanUploadRetentionSeconds: intEnv("P4U_SCAN_UPLOAD_RETENTION", 7 * 24 * 60 * 60),
    pairingClaimRateLimit: intEnv("P4U_PAIRING_CLAIM_RATE_LIMIT", 30),
    sessionRefreshRateLimit: intEnv("P4U_SESSION_REFRESH_RATE_LIMIT", 60),
    scanRequestRateLimit: intEnv("P4U_SCAN_REQUEST_RATE_LIMIT", 600),
  };

  if (rchkbRoot) config.rchkbRoot = rchkbRoot;
  if (process.env.P4U_PUBLIC_BASE_URL) config.publicBaseUrl = process.env.P4U_PUBLIC_BASE_URL;
  if (process.env.P4U_GIT_REMOTE_URL) config.gitRemoteUrl = process.env.P4U_GIT_REMOTE_URL;
  if (process.env.P4U_GIT_USERNAME) config.gitUsername = process.env.P4U_GIT_USERNAME;
  if (process.env.P4U_GIT_TOKEN) config.gitToken = process.env.P4U_GIT_TOKEN;
  if (process.env.P4U_FEDERATION_UPSTREAM_URL) config.federationUpstreamUrl = process.env.P4U_FEDERATION_UPSTREAM_URL;
  if (process.env.P4U_FEDERATION_TOKEN) config.federationToken = process.env.P4U_FEDERATION_TOKEN;
  if (process.env.P4U_ADMIN_KEY) config.adminKey = process.env.P4U_ADMIN_KEY;
  return config;
}
