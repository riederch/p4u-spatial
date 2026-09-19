import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import type { ScanManifest } from "../domain.js";
import type { RepositoryProvider } from "../repository/provider.js";
import { atomicWrite, normalizeRelativePath, nowIso, resolveBelow, sha256, stableStringify } from "../util.js";

interface UploadStatus {
  scanId: string;
  state: "uploading" | "committed";
  manifestSha256: string;
  verifiedFiles: string[];
  missingFiles: string[];
  revision?: string;
}

function isScanManifest(value: unknown): value is ScanManifest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ScanManifest>;
  return item.schemaVersion === "1.0"
    && typeof item.scanId === "string"
    && typeof item.createdAt === "string"
    && ["indoor", "site", "registration", "drift-test"].includes(item.mode ?? "")
    && !!item.device
    && typeof item.device.deviceId === "string"
    && Array.isArray(item.files)
    && item.files.every((f) => typeof f?.path === "string" && /^[a-fA-F0-9]{64}$/.test(f.sha256));
}

export class ScanUploadService {
  private readonly uploadRoot: string;

  constructor(
    stateDir: string,
    private readonly repository: RepositoryProvider,
    private readonly spatialRoot: string,
  ) {
    this.uploadRoot = join(stateDir, "uploads");
  }

  private staging(scanId: string, path: string): string {
    return resolveBelow(join(this.uploadRoot, scanId), path);
  }

  private repoBase(scanId: string): string {
    return `${this.spatialRoot}/raw/scans/${scanId}`;
  }

  private async loadManifest(scanId: string): Promise<ScanManifest> {
    try {
      return JSON.parse(await readFile(this.staging(scanId, "manifest.json"), "utf8")) as ScanManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BridgeError(404, "SCAN_NOT_FOUND", "Scan upload has not been initialized.");
      }
      throw error;
    }
  }

  async putManifest(deviceId: string, scanId: string, input: unknown): Promise<UploadStatus> {
    assertOrThrow(isScanManifest(input), 400, "UNSUPPORTED_SCHEMA", "Invalid or unsupported scan manifest.");
    assertOrThrow(input.scanId === scanId, 400, "SCAN_ID_MISMATCH", "URL scan ID does not match manifest.");
    assertOrThrow(input.device.deviceId === deviceId, 403, "DEVICE_MISMATCH", "Manifest belongs to a different device.");

    const manifest: ScanManifest = {
      ...input,
      files: input.files.map((file) => ({ ...file, path: normalizeRelativePath(file.path) })),
    };
    const manifestHash = sha256(stableStringify(manifest));

    const committedMarker = await this.repository.readFile(`${this.repoBase(scanId)}/_commit.json`);
    if (committedMarker) {
      const committed = JSON.parse(Buffer.from(committedMarker).toString("utf8")) as { manifestSha256: string; revision?: string };
      if (committed.manifestSha256 !== manifestHash) {
        throw new BridgeError(409, "SCAN_ID_CONFLICT", "Scan ID is already committed with different content.");
      }
      return {
        scanId,
        state: "committed",
        manifestSha256: manifestHash,
        verifiedFiles: manifest.files.map((f) => f.path),
        missingFiles: [],
        ...(committed.revision ? { revision: committed.revision } : {}),
      };
    }

    const existingPath = this.staging(scanId, "manifest.json");
    try {
      const existing = JSON.parse(await readFile(existingPath, "utf8")) as ScanManifest;
      if (sha256(stableStringify(existing)) !== manifestHash) {
        throw new BridgeError(409, "SCAN_ID_CONFLICT", "Scan ID is already staged with a different manifest.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await atomicWrite(existingPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    return this.status(scanId);
  }

  async putFile(deviceId: string, scanId: string, rawPath: string, content: Uint8Array, declaredSha256?: string): Promise<UploadStatus> {
    const manifest = await this.loadManifest(scanId);
    if (manifest.device.deviceId !== deviceId) throw new BridgeError(403, "DEVICE_MISMATCH", "Scan belongs to a different device.");

    const path = normalizeRelativePath(rawPath);
    const expected = manifest.files.find((f) => f.path === path);
    if (!expected) throw new BridgeError(400, "UNDECLARED_SCAN_FILE", "File is not declared in scan manifest.");

    const actual = sha256(content);
    if (declaredSha256 && declaredSha256.toLowerCase() !== actual) throw new BridgeError(400, "HASH_MISMATCH", "Uploaded content does not match request hash.");
    if (expected.sha256.toLowerCase() !== actual) throw new BridgeError(400, "HASH_MISMATCH", "Uploaded content does not match manifest SHA-256.");

    const target = this.staging(scanId, `files/${path}`);
    await mkdir(dirname(target), { recursive: true });

    try {
      const previous = await readFile(target);
      if (sha256(previous) !== actual) throw new BridgeError(409, "SCAN_FILE_CONFLICT", "A different file is already staged at this path.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(target, content);
    }

    return this.status(scanId);
  }

  async status(scanId: string): Promise<UploadStatus> {
    const manifest = await this.loadManifest(scanId);
    const verifiedFiles: string[] = [];
    const missingFiles: string[] = [];

    for (const file of manifest.files) {
      const path = this.staging(scanId, `files/${file.path}`);
      try {
        const info = await stat(path);
        if (!info.isFile()) {
          missingFiles.push(file.path);
          continue;
        }
        const data = await readFile(path);
        if (sha256(data).toLowerCase() === file.sha256.toLowerCase()) verifiedFiles.push(file.path);
        else missingFiles.push(file.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") missingFiles.push(file.path);
        else throw error;
      }
    }

    return { scanId, state: "uploading", manifestSha256: sha256(stableStringify(manifest)), verifiedFiles, missingFiles };
  }

  async isCommitted(scanId: string): Promise<boolean> {
    return (await this.repository.readFile(`${this.repoBase(scanId)}/_commit.json`)) !== null;
  }

  async commit(deviceId: string, scanId: string): Promise<UploadStatus> {
    const manifest = await this.loadManifest(scanId);
    if (manifest.device.deviceId !== deviceId) throw new BridgeError(403, "DEVICE_MISMATCH", "Scan belongs to a different device.");

    const current = await this.status(scanId);
    if (current.missingFiles.length > 0) {
      throw new BridgeError(409, "SCAN_INCOMPLETE", "Scan is missing required files.", { missingFiles: current.missingFiles });
    }

    const base = this.repoBase(scanId);
    const existing = await this.repository.readFile(`${base}/_commit.json`);
    if (existing) {
      const marker = JSON.parse(Buffer.from(existing).toString("utf8")) as { manifestSha256: string; revision?: string };
      if (marker.manifestSha256 !== current.manifestSha256) throw new BridgeError(409, "SCAN_ID_CONFLICT", "Scan ID is already committed with different content.");
      return { ...current, state: "committed", ...(marker.revision ? { revision: marker.revision } : {}) };
    }

    const changes = [{
      path: `${base}/manifest.json`,
      content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      ifAbsent: true,
    }];

    for (const file of manifest.files) {
      changes.push({
        path: `${base}/${file.path}`,
        content: await readFile(this.staging(scanId, `files/${file.path}`)),
        ifAbsent: true,
      });
    }

    changes.push({
      path: `${base}/_commit.json`,
      content: Buffer.from(`${JSON.stringify({
        scanId,
        manifestSha256: current.manifestSha256,
        committedAt: nowIso(),
      }, null, 2)}\n`),
      ifAbsent: true,
    });

    const result = await this.repository.commitFiles(changes, `p4u-spatial: ingest scan ${scanId}`);
    await rm(join(this.uploadRoot, scanId), { recursive: true, force: true });

    return { ...current, state: "committed", revision: result.revision };
  }
}
