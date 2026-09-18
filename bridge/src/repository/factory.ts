import type { BridgeConfig } from "../config.js";
import { BridgeError } from "../errors.js";
import { FilesystemRepositoryProvider } from "./filesystem.js";
import { GitRemoteRepositoryProvider } from "./git-remote.js";
import type { RepositoryProvider } from "./provider.js";

export async function createRepositoryProvider(config: BridgeConfig): Promise<RepositoryProvider> {
  if (config.repositoryProvider === "filesystem") {
    return new FilesystemRepositoryProvider(config.repositoryRoot);
  }

  if (!config.gitRemoteUrl) {
    throw new BridgeError(500, "REPOSITORY_CONFIG_INVALID", "P4U_GIT_REMOTE_URL is required when P4U_REPOSITORY_PROVIDER=git.");
  }

  const provider = new GitRemoteRepositoryProvider({
    root: config.repositoryRoot,
    remoteUrl: config.gitRemoteUrl,
    branch: config.gitBranch,
    ...(config.gitUsername ? { username: config.gitUsername } : {}),
    ...(config.gitToken ? { token: config.gitToken } : {}),
    refreshIntervalMs: config.gitRefreshIntervalMs,
  });
  await provider.initialize();
  return provider;
}
