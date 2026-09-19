import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BridgeError } from "../errors.js";
import { normalizeRelativePath, resolveBelow, sha256 } from "../util.js";
import type { CommitResult, FileChange, RepositoryProvider } from "./provider.js";

const execFileAsync = promisify(execFile);

export interface GitRemoteRepositoryOptions {
  root: string;
  remoteUrl: string;
  branch: string;
  username?: string;
  token?: string;
  refreshIntervalMs?: number;
}

export class GitRemoteRepositoryProvider implements RepositoryProvider {
  readonly kind = "git";
  private gate: Promise<void> = Promise.resolve();
  private initialized = false;
  private lastRefreshAt = 0;

  constructor(private readonly options: GitRemoteRepositoryOptions) {}

  private authEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    };
    if (this.options.token) {
      const username = this.options.username ?? "x-access-token";
      env.GIT_CONFIG_COUNT = "1";
      env.GIT_CONFIG_KEY_0 = "http.extraHeader";
      env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`${username}:${this.options.token}`).toString("base64")}`;
    }
    return env;
  }

  private async git(args: string[], cwd = this.options.root): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: this.authEnv(),
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout.trim();
  }

  private async withGate<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.gate;
    this.gate = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.withGate(async () => {
      if (this.initialized) return;
      await mkdir(this.options.root, { recursive: true });

      let hasGit = false;
      try {
        await stat(join(this.options.root, ".git"));
        hasGit = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      if (!hasGit) {
        const entries = await readdir(this.options.root);
        if (entries.length > 0) {
          throw new BridgeError(500, "REPOSITORY_CONFIG_INVALID", "Git repository root is not empty and is not a Git checkout.");
        }
        try {
          await this.git(["clone", "--branch", this.options.branch, "--single-branch", this.options.remoteUrl, "."], this.options.root);
        } catch (error) {
          throw new BridgeError(503, "REPOSITORY_UNAVAILABLE", `Unable to clone Git repository: ${String((error as Error).message)}`);
        }
      } else {
        await this.git(["remote", "set-url", "origin", this.options.remoteUrl]);
      }

      await this.git(["config", "user.name", "P4U Spatial"]);
      await this.git(["config", "user.email", "p4u-spatial@localhost"]);
      await this.refresh(true);
      this.initialized = true;
    });
  }

  private async refresh(force: boolean): Promise<void> {
    const interval = this.options.refreshIntervalMs ?? 1000;
    if (!force && Date.now() - this.lastRefreshAt < interval) return;

    try {
      await this.git(["fetch", "--prune", "origin", this.options.branch]);
      await this.git(["reset", "--hard", `origin/${this.options.branch}`]);
      this.lastRefreshAt = Date.now();
    } catch (error) {
      throw new BridgeError(503, "REPOSITORY_UNAVAILABLE", `Unable to refresh Git repository: ${String((error as Error).message)}`);
    }
  }

  private async readLocal(path: string): Promise<Uint8Array | null> {
    const target = resolveBelow(this.options.root, normalizeRelativePath(path));
    try {
      return await readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    await this.initialize();
    return this.withGate(async () => {
      await this.refresh(false);
      return this.readLocal(path);
    });
  }

  async exists(path: string): Promise<boolean> {
    return (await this.readFile(path)) !== null;
  }

  async probe(): Promise<{ ready: boolean; detail?: string }> {
    try {
      await this.initialize();
      await this.withGate(async () => {
        await this.refresh(false);
        await this.git(["rev-parse", "--verify", "HEAD"]);
      });
      return { ready: true };
    } catch (error) {
      return { ready: false, detail: String((error as Error).message) };
    }
  }

  private async assertPreconditions(change: FileChange): Promise<void> {
    const existing = await this.readLocal(change.path);
    if (change.ifAbsent && existing) {
      throw new BridgeError(409, "REPOSITORY_CONFLICT", `Repository path already exists: ${change.path}`);
    }
    if (change.expectedSha256 !== undefined) {
      const actual = sha256(existing ?? new Uint8Array());
      if (actual !== change.expectedSha256) {
        throw new BridgeError(409, "REPOSITORY_CONFLICT", `Repository path changed concurrently: ${change.path}`);
      }
    }
  }

  async commitFiles(changes: FileChange[], message: string): Promise<CommitResult> {
    await this.initialize();
    return this.withGate(async () => {
      await this.refresh(true);
      for (const change of changes) await this.assertPreconditions(change);

      const paths: string[] = [];
      for (const change of changes) {
        const path = normalizeRelativePath(change.path);
        const target = resolveBelow(this.options.root, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, change.content);
        paths.push(path);
      }

      await this.git(["add", "--", ...paths]);
      const staged = await this.git(["diff", "--cached", "--name-only", "--", ...paths]);
      if (!staged) return { revision: await this.git(["rev-parse", "HEAD"]) };

      await this.git(["commit", "-m", message, "--", ...paths]);
      const revision = await this.git(["rev-parse", "HEAD"]);

      try {
        await this.git(["push", "origin", `HEAD:refs/heads/${this.options.branch}`]);
        this.lastRefreshAt = Date.now();
        return { revision };
      } catch {
        try {
          await this.git(["fetch", "--prune", "origin", this.options.branch]);
          await this.git(["reset", "--hard", `origin/${this.options.branch}`]);
          this.lastRefreshAt = Date.now();
        } catch {
          // Preserve the primary repository conflict below.
        }
        throw new BridgeError(409, "REPOSITORY_CONFLICT", "Git remote changed concurrently; retry the logical operation.");
      }
    });
  }
}
