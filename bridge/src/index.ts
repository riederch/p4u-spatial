export { buildServer } from "./server.js";
export { loadConfig, type BridgeConfig } from "./config.js";
export { FilesystemRepositoryProvider } from "./repository/filesystem.js";
export { GitRemoteRepositoryProvider, type GitRemoteRepositoryOptions } from "./repository/git-remote.js";
export { createRepositoryProvider } from "./repository/factory.js";
export type { RepositoryProvider, FileChange, CommitResult } from "./repository/provider.js";
