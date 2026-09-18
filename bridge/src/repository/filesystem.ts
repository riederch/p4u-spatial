import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BridgeError } from "../errors.js";
import { newId, resolveBelow, sha256 } from "../util.js";
import type { CommitResult, FileChange, RepositoryProvider } from "./provider.js";

export class FilesystemRepositoryProvider implements RepositoryProvider {
  readonly kind = "filesystem";

  constructor(private readonly root: string) {}

  async readFile(path: string): Promise<Uint8Array | null> {
    const target = resolveBelow(this.root, path);
    try {
      return await readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(resolveBelow(this.root, path));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async assertPreconditions(change: FileChange): Promise<void> {
    const existing = await this.readFile(change.path);
    if (change.ifAbsent && existing) {
      throw new BridgeError(409, "REPOSITORY_CONFLICT", `Repository path already exists: ${change.path}`);
    }
    if (change.expectedSha256 !== undefined && sha256(existing ?? new Uint8Array()) !== change.expectedSha256) {
      throw new BridgeError(409, "REPOSITORY_CONFLICT", `Repository path changed concurrently: ${change.path}`);
    }
  }

  async commitFiles(changes: FileChange[], _message: string): Promise<CommitResult> {
    for (const change of changes) await this.assertPreconditions(change);

    const stageRoot = join(this.root, ".p4u-stage", newId());
    await mkdir(stageRoot, { recursive: true });

    try {
      for (const change of changes) {
        const staged = resolveBelow(stageRoot, change.path);
        await mkdir(dirname(staged), { recursive: true });
        await writeFile(staged, change.content);
      }

      for (const change of changes) await this.assertPreconditions(change);

      for (const change of changes) {
        const staged = resolveBelow(stageRoot, change.path);
        const target = resolveBelow(this.root, change.path);
        await mkdir(dirname(target), { recursive: true });
        await rename(staged, target);
      }

      return { revision: `fs-${newId()}` };
    } finally {
      await rm(stageRoot, { recursive: true, force: true });
    }
  }
}
