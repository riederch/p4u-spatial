import { resolve } from "node:path";

export interface BridgeConfig {
  host: string;
  port: number;
  publicBaseUrl?: string;
  adminKey?: string;
  stateDir: string;
  repositoryRoot: string;
  repositoryProvider: "filesystem" | "git";
  gitRemoteUrl?: string;
  gitBranch: string;
  gitUsername?: string;
  gitToken?: string;
  gitRefreshIntervalMs: number;
  spatialRoot: string;
  spatialSourceTitle: string;
  spatialSnapshotTtlSeconds: number;
  spatialOperationRetentionSeconds: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  pairingTtlSeconds: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function loadConfig(): BridgeConfig {
  const config: BridgeConfig = {
    host: process.env.P4U_HOST ?? "0.0.0.0",
    port: intEnv("P4U_PORT", 8787),
    stateDir: resolve(process.env.P4U_STATE_DIR ?? ".data/state"),
    repositoryRoot: resolve(process.env.P4U_REPOSITORY_ROOT ?? ".data/repository"),
    repositoryProvider: process.env.P4U_REPOSITORY_PROVIDER === "git" ? "git" : "filesystem",
    gitBranch: process.env.P4U_GIT_BRANCH ?? "main",
    gitRefreshIntervalMs: intEnv("P4U_GIT_REFRESH_INTERVAL_MS", 1000),
    spatialRoot: process.env.P4U_SPATIAL_ROOT ?? "spatial",
    spatialSourceTitle: process.env.P4U_SPATIAL_SOURCE_TITLE ?? "P4U Spatial Repository",
    spatialSnapshotTtlSeconds: intEnv("P4U_SPATIAL_SNAPSHOT_TTL", 10 * 60),
    spatialOperationRetentionSeconds: intEnv("P4U_SPATIAL_OPERATION_RETENTION", 7 * 24 * 60 * 60),
    accessTokenTtlSeconds: intEnv("P4U_ACCESS_TOKEN_TTL", 30 * 60),
    refreshTokenTtlSeconds: intEnv("P4U_REFRESH_TOKEN_TTL", 30 * 24 * 60 * 60),
    pairingTtlSeconds: intEnv("P4U_PAIRING_TTL", 5 * 60),
  };

  if (process.env.P4U_PUBLIC_BASE_URL) config.publicBaseUrl = process.env.P4U_PUBLIC_BASE_URL;
  if (process.env.P4U_GIT_REMOTE_URL) config.gitRemoteUrl = process.env.P4U_GIT_REMOTE_URL;
  if (process.env.P4U_GIT_USERNAME) config.gitUsername = process.env.P4U_GIT_USERNAME;
  if (process.env.P4U_GIT_TOKEN) config.gitToken = process.env.P4U_GIT_TOKEN;
  if (process.env.P4U_ADMIN_KEY) config.adminKey = process.env.P4U_ADMIN_KEY;
  return config;
}
