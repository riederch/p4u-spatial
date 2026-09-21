import { join } from "node:path";
import type { BridgeConfig } from "../config.js";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";

export type OperatorBridgeConfig = Omit<BridgeConfig, "host" | "port" | "stateDir" | "repositoryRoot" | "adminKey">;

interface State {
  initialized: boolean;
  config?: OperatorBridgeConfig;
}

const SECRET_FIELDS = new Set<keyof OperatorBridgeConfig>(["gitToken", "federationToken"]);

// ADR: docs/adr/bridge/0018-web-managed-configuration.md — persisted Bridge state is the operator configuration authority after bootstrap migration.
export class BridgeConfigStore {
  private readonly store: AtomicJsonStore<State>;

  constructor(
    stateDir: string,
    private readonly bootstrap: BridgeConfig,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "bridge-config.json"), () => ({ initialized: false }));
  }

  private operatorFrom(config: BridgeConfig): OperatorBridgeConfig {
    const {
      host: _host,
      port: _port,
      stateDir: _stateDir,
      repositoryRoot: _repositoryRoot,
      adminKey: _adminKey,
      ...operator
    } = config;
    return operator;
  }

  async loadOrMigrate(): Promise<BridgeConfig> {
    return this.store.mutate((state) => {
      if (!state.initialized || !state.config) {
        state.initialized = true;
        state.config = this.operatorFrom(this.bootstrap);
      }
      return {
        host: this.bootstrap.host,
        port: this.bootstrap.port,
        stateDir: this.bootstrap.stateDir,
        repositoryRoot: this.bootstrap.repositoryRoot,
        ...(this.bootstrap.adminKey ? { adminKey: this.bootstrap.adminKey } : {}),
        ...state.config,
      };
    });
  }

  async publicView(): Promise<Record<string, unknown>> {
    const state = await this.store.read();
    const config = state.config ?? this.operatorFrom(this.bootstrap);
    const result: Record<string, unknown> = { ...config };
    for (const field of SECRET_FIELDS) {
      if (config[field]) result[field] = { configured: true };
      else delete result[field];
    }
    return result;
  }

  async update(input: Record<string, unknown>): Promise<{ restartRequired: true }> {
    await this.store.mutate((state) => {
      const current = state.config ?? this.operatorFrom(this.bootstrap);
      const next = { ...current } as Record<string, unknown>;

      const strings = [
        "publicBaseUrl", "localBaseUrl", "adminWebauthnRpId", "adminWebauthnOrigin",
        "rchkbRoot", "gitRemoteUrl", "gitBranch", "gitUsername", "federationUpstreamUrl",
        "federationRouteId", "spatialRoot", "spatialRouteId", "spatialSourceTitle",
      ] as const;
      for (const field of strings) {
        if (!(field in input)) continue;
        const raw = input[field];
        assertOrThrow(raw === null || typeof raw === "string", 400, "CONFIG_INVALID", `${field} must be a string or null.`);
        const value = typeof raw === "string" ? raw.trim() : "";
        if (value) next[field] = value;
        else delete next[field];
      }

      if ("repositoryProvider" in input) {
        assertOrThrow(input.repositoryProvider === "filesystem" || input.repositoryProvider === "git", 400, "CONFIG_INVALID", "repositoryProvider must be filesystem or git.");
        next.repositoryProvider = input.repositoryProvider;
      }
      if ("repositoryProfile" in input) {
        assertOrThrow(input.repositoryProfile === "generic" || input.repositoryProfile === "rchkb", 400, "CONFIG_INVALID", "repositoryProfile must be generic or rchkb.");
        next.repositoryProfile = input.repositoryProfile;
      }
      if ("spatialWritable" in input) {
        assertOrThrow(typeof input.spatialWritable === "boolean", 400, "CONFIG_INVALID", "spatialWritable must be boolean.");
        next.spatialWritable = input.spatialWritable;
      }

      const positiveInts = [
        "gitRefreshIntervalMs", "spatialSnapshotTtlSeconds", "spatialOperationRetentionSeconds",
        "accessTokenTtlSeconds", "refreshTokenTtlSeconds", "pairingTtlSeconds", "scanMaxFiles",
        "scanMaxFileBytes", "scanMaxTotalBytes", "scanUploadRetentionSeconds",
        "pairingClaimRateLimit", "sessionRefreshRateLimit", "scanRequestRateLimit",
        "federationRetryBaseSeconds", "federationRetryMaxSeconds", "federationRelayRetentionSeconds",
      ] as const;
      for (const field of positiveInts) {
        if (!(field in input)) continue;
        const value = input[field];
        assertOrThrow(typeof value === "number" && Number.isSafeInteger(value) && value > 0, 400, "CONFIG_INVALID", `${field} must be a positive integer.`);
        next[field] = value;
      }

      for (const field of SECRET_FIELDS) {
        if (!(field in input)) continue;
        const value = input[field];
        assertOrThrow(value === null || typeof value === "string", 400, "CONFIG_INVALID", `${String(field)} must be a string or null.`);
        if (typeof value === "string" && value.length > 0) next[field] = value;
        else if (value === null) delete next[field];
        // Empty string means keep the current secret unchanged.
      }

      const provider = next.repositoryProvider;
      if (provider === "git") {
        assertOrThrow(typeof next.gitRemoteUrl === "string" && next.gitRemoteUrl.length > 0, 400, "CONFIG_INVALID", "gitRemoteUrl is required for git repositories.");
      }
      if (next.repositoryProfile === "rchkb") {
        assertOrThrow(typeof next.rchkbRoot === "string" && next.rchkbRoot.length > 0, 400, "CONFIG_INVALID", "rchkbRoot is required for the rchkb profile.");
        const root = next.rchkbRoot as string;
        assertOrThrow(!root.split("/").some((part) => !part || part === "." || part === ".."), 400, "CONFIG_INVALID", "rchkbRoot must be repository-relative.");
        next.spatialRoot = `${root.replace(/^\/+|\/+$/g, "")}/_agents/spatial`;
        next.spatialRouteId = "rchkb-git";
      } else if (next.spatialRouteId === "rchkb-git") {
        next.spatialRouteId = "git-repository";
      }

      state.initialized = true;
      state.config = next as OperatorBridgeConfig;
    });
    return { restartRequired: true };
  }
}
